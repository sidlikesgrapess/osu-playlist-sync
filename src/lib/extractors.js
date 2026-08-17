import { cleanSongTitle } from './titleCleaner';
import { extractPlaylistId, fetchPlaylistItems } from './youtube';

/**
 * Universal Track and Playlist Extractor for YouTube, Spotify, and Apple Music
 */

// Helper to fetch Spotify playlist / album / track metadata without API keys
async function fetchSpotifyEntity(url) {
  // Extract entity type and ID
  const match = url.match(/open\.spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)/);
  if (!match) throw new Error('Invalid Spotify URL');

  const type = match[1];
  const id = match[2];

  if (type === 'track') {
    // 1. Single Spotify Track via oEmbed / embed page
    try {
      const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        return {
          title: data.title || 'Spotify Track',
          songs: [{
            title: data.title,
            channelTitle: data.author_name || '',
            thumbnail: data.thumbnail_url,
          }],
        };
      }
    } catch (e) {
      console.warn('[Spotify oEmbed Error]:', e);
    }
  }

  // 2. Spotify Playlist / Album via Embed page HTML (contains __NEXT_DATA__ JSON with all tracks)
  const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
  const res = await fetch(embedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) throw new Error(`Could not access Spotify ${type}`);

  const html = await res.text();
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
      console.warn('[Spotify NEXT_DATA Parse Error]:', e);
    }
  }

  // Fallback: regex search for tracks in embed HTML
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].replace(' | Spotify', '') : `Spotify ${type}`;
  return { title: pageTitle, songs: [] };
}

// Helper to fetch Apple Music playlist / album / song metadata
async function fetchAppleMusicEntity(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!res.ok) throw new Error('Could not access Apple Music page');

  const html = await res.text();

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

  throw new Error('Could not extract tracks from this Apple Music link');
}

// Helper to fetch single YouTube video via oEmbed
async function fetchYouTubeSingleVideo(url) {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const res = await fetch(oembedUrl);
  if (!res.ok) throw new Error('Could not read YouTube video details');

  const data = await res.json();
  return {
    title: data.title || 'YouTube Song',
    songs: [{
      title: data.title,
      channelTitle: data.author_name || '',
      thumbnail: data.thumbnail_url,
    }],
  };
}

/**
 * Universal extractor function
 */
export async function extractMusicData(inputUrlOrQuery) {
  const trimmed = (inputUrlOrQuery || '').trim();
  if (!trimmed) throw new Error('Please provide a music link or search query');

  let result = {
    title: 'Music Search',
    platform: 'query',
    songs: [],
    isSingleTrack: false,
  };

  // 1. Check if Spotify URL
  if (trimmed.includes('spotify.com')) {
    const isSingle = trimmed.includes('/track/');
    const data = await fetchSpotifyEntity(trimmed);
    result = {
      title: data.title,
      platform: 'spotify',
      songs: data.songs,
      isSingleTrack: isSingle,
    };
  }
  // 2. Check if Apple Music URL
  else if (trimmed.includes('music.apple.com')) {
    const isSingle = trimmed.includes('/song/') || trimmed.includes('?i=');
    const data = await fetchAppleMusicEntity(trimmed);
    result = {
      title: data.title,
      platform: 'apple',
      songs: data.songs,
      isSingleTrack: isSingle,
    };
  }
  // 3. Check if YouTube Playlist or Single Video
  else if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
    const playlistId = extractPlaylistId(trimmed);
    if (playlistId) {
      // It's a YouTube Playlist
      const data = await fetchPlaylistItems(playlistId);
      result = {
        title: data.playlistTitle,
        platform: 'youtube',
        songs: data.songs,
        isSingleTrack: false,
        isDemo: data.isDemo,
      };
    } else {
      // It's a Single YouTube Video
      const data = await fetchYouTubeSingleVideo(trimmed);
      result = {
        title: data.title,
        platform: 'youtube',
        songs: data.songs,
        isSingleTrack: true,
      };
    }
  }
  // 4. Raw Text Query (e.g. "YOASOBI - Idol")
  else {
    result = {
      title: trimmed,
      platform: 'query',
      isSingleTrack: true,
      songs: [{
        title: trimmed,
        channelTitle: '',
      }],
    };
  }

  // Clean and prepare each track for osu! matching
  const processedSongs = (result.songs || []).map((song, index) => {
    const cleaned = cleanSongTitle(song.title, song.channelTitle);
    return {
      ...song,
      id: song.id || `track_${index}_${Date.now()}`,
      index: index + 1,
      position: index,
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
