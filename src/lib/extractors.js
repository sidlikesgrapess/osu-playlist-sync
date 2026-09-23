import { cleanSongTitle } from './titleCleaner.js';
import { extractPlaylistId, extractVideoId, fetchPlaylistItems, ExtractionError } from './youtube.js';
import { classifyInput, buildProviderUrl } from './platform.js';
import { fetchText, fetchJson } from './http.js';
import { ValidationError } from './validate.js';

export { ExtractionError };

/**
 * Universal Track and Playlist Extractor for YouTube, Spotify, and Apple Music.
 *
 * The caller's text only ever picks a provider (`classifyInput`, strictly from the URL's own
 * host) and supplies an id; every URL fetched here is rebuilt from that id with
 * `buildProviderUrl`, so no caller string reaches `fetch` (F-02). Every fetch goes through
 * `http.js`, which puts a timeout, a byte cap and a named UA on it (F-26, X-02, X-07).
 */

// Which UA each scraped provider gets, chosen once here in data (http.js UA_PROFILES).
// The embed and public pages are scraped and answer differently to an obvious bot; the
// oEmbed endpoints are documented APIs and get the honest server UA.
const SPOTIFY_PAGE = { profile: 'browserLike', maxBytes: 5_000_000 };
const APPLE_PAGE = {
  profile: 'browserLike',
  maxBytes: 5_000_000,
  headers: { 'Accept-Language': 'en-US,en;q=0.9' },
};
const OEMBED = { profile: 'server' };

const SPOTIFY_PATH = /^\/(playlist|album|track)\/([A-Za-z0-9]+)\/?$/;
const APPLE_PATH = /^\/([a-z]{2})\/(playlist|album|song)\/(?:([^/]+)\/)?([A-Za-z0-9.]+)\/?$/;

// Helper to fetch Spotify playlist / album / track metadata without API keys
async function fetchSpotifyEntity(url) {
  const match = new URL(url).pathname.match(SPOTIFY_PATH);
  if (!match) throw new ValidationError('That Spotify link is not a playlist, album or track');

  const type = match[1];
  const id = match[2];

  if (type === 'track') {
    // 1. Single Spotify Track via oEmbed / embed page
    try {
      const trackUrl = buildProviderUrl('spotify', `track/${id}`);
      const data = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(trackUrl)}`, OEMBED);
      return {
        title: data.title || 'Spotify Track',
        songs: [{
          title: data.title,
          channelTitle: data.author_name || '',
          thumbnail: data.thumbnail_url,
        }],
      };
    } catch (e) {
      console.warn('[Spotify oEmbed Error]:', e.message);
    }
  }

  // 2. Spotify Playlist / Album via Embed page HTML (contains __NEXT_DATA__ JSON with all tracks)
  const html = await fetchText(buildProviderUrl('spotify', `embed/${type}/${id}`), SPOTIFY_PAGE);
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

  if (nextDataMatch) {
    try {
      const parsed = JSON.parse(nextDataMatch[1]);
      const entity = parsed.props?.pageProps?.state?.data?.entity;
      const title = entity?.name || `Spotify ${type === 'album' ? 'Album' : 'Playlist'}`;
      const rawTracks = entity?.trackList || [];

      const songs = rawTracks.map(t => ({
        title: t.title || t.name,
        channelTitle: t.subtitle || (t.artists ? t.artists.map(a => a.name).join(', ') : ''),
        thumbnail: entity?.coverArt?.sources?.[0]?.url,
        duration: t.duration,
      }));

      return { title, songs };
    } catch (e) {
      console.warn('[Spotify NEXT_DATA Parse Error]:', e.message);
    }
  }

  // Fallback: regex search for tracks in embed HTML
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].replace(' | Spotify', '') : `Spotify ${type}`;
  return { title: pageTitle, songs: [] };
}

/**
 * The canonical Apple Music URL for a pasted one, rebuilt from its parts. Only the
 * storefront, the entity kind, the slug segment, the id and the `i` (song within an album)
 * parameter survive; everything else the caller typed is dropped.
 */
function appleProviderUrl(url) {
  const parsed = new URL(url);
  const match = parsed.pathname.match(APPLE_PATH);
  if (!match) throw new ValidationError('That Apple Music link is not a playlist, album or song');
  const [, storefront, kind, slug, id] = match;
  const songId = parsed.searchParams.get('i');
  const query = songId && /^\d+$/.test(songId) ? `?i=${songId}` : '';
  return buildProviderUrl('apple', `${storefront}/${kind}/${slug ? `${slug}/` : ''}${id}${query}`);
}

// Helper to fetch Apple Music playlist / album / song metadata
async function fetchAppleMusicEntity(url) {
  const html = await fetchText(appleProviderUrl(url), APPLE_PAGE);

  // 1. Try extracting schema.org LD+JSON
  const scriptRegex = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let schemaData = null;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      if (data['@type'] === 'MusicPlaylist' || data['@type'] === 'MusicAlbum' || data.track) {
        schemaData = data;
        break;
      }
    } catch (e) {
      // ignore
    }
  }

  if (schemaData) {
    const playlistTitle = schemaData.name || 'Apple Music Collection';
    const rawTracks = schemaData.track || [];
    const songs = rawTracks.map(t => ({
      title: t.name,
      channelTitle: t.byArtist?.name || schemaData.byArtist?.name || '',
    }));

    if (songs.length > 0) {
      return { title: playlistTitle, songs };
    }
  }

  // 2. Single Song check via OpenGraph
  const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
  if (ogTitleMatch) {
    let cleanOg = ogTitleMatch[1].replace(/ on Apple\s*Music/i, '');
    let artist = '';
    let songTitle = cleanOg;

    // Usually "Song Name by Artist Name"
    const byMatch = cleanOg.match(/^(.+?)\s+by\s+(.+)$/i);
    if (byMatch) {
      songTitle = byMatch[1];
      artist = byMatch[2];
    }

    return {
      title: cleanOg,
      songs: [{
        title: songTitle,
        channelTitle: artist,
      }],
    };
  }

  throw new ExtractionError('Could not extract tracks from this Apple Music link');
}

// Helper to fetch single YouTube video via oEmbed
async function fetchYouTubeSingleVideo(videoId) {
  const videoUrl = buildProviderUrl('youtube', videoId);
  const data = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`, OEMBED);
  return {
    title: data.title || 'YouTube Song',
    songs: [{
      title: data.title,
      channelTitle: data.author_name || '',
      thumbnail: data.thumbnail_url,
    }],
  };
}

/** Routes one classified input to its provider. */
async function extractByKind(input) {
  switch (input.kind) {
    case 'spotify': {
      const isSingle = SPOTIFY_PATH.exec(new URL(input.url).pathname)?.[1] === 'track';
      const data = await fetchSpotifyEntity(input.url);
      return { title: data.title, platform: 'spotify', songs: data.songs, isSingleTrack: isSingle };
    }
    case 'apple': {
      const parsed = new URL(input.url);
      const isSingle = parsed.pathname.includes('/song/') || parsed.searchParams.has('i');
      const data = await fetchAppleMusicEntity(input.url);
      return { title: data.title, platform: 'apple', songs: data.songs, isSingleTrack: isSingle };
    }
    case 'youtube': {
      const playlistId = extractPlaylistId(input.url);
      if (playlistId) {
        const data = await fetchPlaylistItems(playlistId);
        return {
          title: data.playlistTitle,
          platform: 'youtube',
          songs: data.songs,
          isSingleTrack: false,
          isDemo: data.isDemo,
        };
      }
      const videoId = extractVideoId(input.url);
      if (!videoId) throw new ValidationError('That YouTube link is not a playlist or a video');
      const data = await fetchYouTubeSingleVideo(videoId);
      return { title: data.title, platform: 'youtube', songs: data.songs, isSingleTrack: true };
    }
    case 'query':
      // Raw Text Query (e.g. "YOASOBI - Idol")
      return {
        title: input.query,
        platform: 'query',
        isSingleTrack: true,
        songs: [{ title: input.query, channelTitle: '' }],
      };
    case 'player':
      throw new ValidationError('osu! profile links open in the player view, not as a playlist');
    default:
      throw new ValidationError('That link is not from YouTube, Spotify or Apple Music');
  }
}

/**
 * Universal extractor function.
 *
 * Throws `ValidationError` (400) for input that is not a usable link or query, and
 * `ExtractionError` for a provider that could not be read. An upstream error (timeout,
 * non-2xx, over the byte cap) is wrapped rather than echoed, since its message carries the
 * upstream URL.
 */
export async function extractMusicData(inputUrlOrQuery) {
  const trimmed = (inputUrlOrQuery || '').trim();
  if (!trimmed) throw new ValidationError('Please provide a music link or search query');

  let result;
  try {
    result = await extractByKind(classifyInput(trimmed));
  } catch (err) {
    if (err instanceof ValidationError || err instanceof ExtractionError) throw err;
    console.warn('[Extractor] upstream failure:', err.message);
    throw new ExtractionError('Could not read that link right now. Check that it is public and try again.', { cause: err });
  }

  // Clean and prepare each track for osu! matching
  const processedSongs = (result.songs || []).map((song, index) => {
    const cleaned = cleanSongTitle(song.title, song.channelTitle);
    return {
      ...song,
      id: song.id || `track_${index}_${Date.now()}`,
      index: index + 1,
      position: index,
      // Where the metadata came from. Spotify/Apple hand us a real artist field, so the
      // matcher may trust it enough to reject on; a YouTube channel name it may not.
      source: result.platform,
      cleanQuery: cleaned.cleanQuery,
      extractedArtist: cleaned.artist,
      extractedTitle: cleaned.title,
      fallbacks: cleaned.fallbacks,
      queries: cleaned.queries,
    };
  });

  return {
    success: true,
    platform: result.platform,
    playlistTitle: result.title,
    isSingleTrack: result.isSingleTrack,
    isDemo: result.isDemo || false,
    totalSongs: processedSongs.length,
    songs: processedSongs,
  };
}
