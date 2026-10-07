import { cleanSongTitle, cleanPlaylistTitles } from './titleCleaner.js';
import { extractPlaylistId, extractVideoId, fetchPlaylistItems, ExtractionError } from './youtube.js';
import { classifyInput, buildProviderUrl } from './platform.js';
import { fetchText, fetchJson } from './http.js';
import { ValidationError } from './validate.js';
import { normalizeForComparison } from './text.js';

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

// Sources whose tracks carry the provider's own artist field.
const STRUCTURED_PLATFORMS = new Set(['spotify', 'apple']);

// A share link from a localized page carries an `/intl-xx/` segment before the entity.
const SPOTIFY_PATH = /^\/(?:intl-[a-z-]+\/)?(playlist|album|track)\/([A-Za-z0-9]+)\/?$/;
const APPLE_PATH = /^\/([a-z]{2})\/(playlist|album|song)\/(?:([^/]+)\/)?([A-Za-z0-9.]+)\/?$/;

const SPOTIFY_TYPE_LABEL = { playlist: 'Playlist', album: 'Album', track: 'Track' };

// Fetches a Spotify playlist / album / track through its embed page, without API keys.
// One path for all three: the oEmbed endpoint has no artist field, so a track read from it
// arrived with no artist and was matched on its title alone.
async function fetchSpotifyEntity(url) {
  const match = new URL(url).pathname.match(SPOTIFY_PATH);
  if (!match) throw new ValidationError('That Spotify link is not a playlist, album or track');
  const [, type, id] = match;
  const html = await fetchText(buildProviderUrl('spotify', `embed/${type}/${id}`), SPOTIFY_PAGE);
  return parseSpotifyEmbed(html, type);
}

/**
 * The cover the row shows: the smallest image at least 100px wide, else the first listed.
 * A playlist lists `coverArt.sources` (often with no sizes), a track `visualIdentity.image`.
 */
function spotifyCover(entity) {
  const images = entity?.coverArt?.sources || entity?.visualIdentity?.image || [];
  const width = (img) => img?.maxWidth ?? img?.width ?? 0;
  const fit = images.filter((img) => width(img) >= 100).sort((a, b) => width(a) - width(b))[0];
  return (fit || images[0])?.url || null;
}

/**
 * The songs in a Spotify embed page's `__NEXT_DATA__`. A playlist or album lists them in
 * `trackList`; a track's entity is the song itself.
 */
export function parseSpotifyEmbed(html, type) {
  const fallbackTitle = `Spotify ${SPOTIFY_TYPE_LABEL[type] || 'Playlist'}`;
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

  if (nextDataMatch) {
    try {
      const parsed = JSON.parse(nextDataMatch[1]);
      const entity = parsed.props?.pageProps?.state?.data?.entity;
      const thumbnail = spotifyCover(entity);
      const rawTracks = type === 'track' ? (entity ? [entity] : []) : entity?.trackList || [];

      // Spotify sends a song that is unavailable in this country with an empty title.
      const named = rawTracks.filter(t => t.title || t.name);
      const songs = named.map(t => ({
        title: t.title || t.name,
        channelTitle: t.subtitle || (t.artists ? t.artists.map(a => a.name).join(', ') : ''),
        thumbnail,
        duration: t.duration,
      }));

      return {
        title: entity?.name || fallbackTitle,
        songs,
        counts: { unavailableCount: rawTracks.length - named.length, loadedCount: rawTracks.length },
      };
    } catch (e) {
      console.warn('[Spotify NEXT_DATA Parse Error]:', e.message);
    }
  }

  // Fallback: the page title, and no songs
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].replace(' | Spotify', '') : fallbackTitle;
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
  // l=en-US asks for English names; other storefronts otherwise answer in their own script.
  const query = `?${songId && /^\d+$/.test(songId) ? `i=${songId}&` : ''}l=en-US`;
  return buildProviderUrl('apple', `${storefront}/${kind}/${slug ? `${slug}/` : ''}${id}${query}`);
}

/**
 * The attributes of one HTML start tag, as a lowercase-keyed map. Values may be double-quoted,
 * single-quoted or bare (Apple writes `id=schema:music-playlist` unquoted), and their order
 * does not matter.
 */
function parseAttributes(source) {
  const attrs = {};
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * The bodies of every `<script>` whose attributes include all of `required`, matched by
 * attribute presence in any order (F-06: the old regex demanded `type` first and matched
 * nothing on Apple's real pages). The attributes are capture group 1, the body group 2.
 */
function scriptBodies(html, required) {
  const bodies = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = parseAttributes(m[1]);
    if (Object.entries(required).every(([k, v]) => attrs[k] === v)) bodies.push(m[2]);
  }
  return bodies;
}

function parseJsonBlocks(bodies) {
  const out = [];
  for (const body of bodies) {
    try {
      out.push(JSON.parse(body));
    } catch {
      // a block that is not JSON is ignored, like any other markup
    }
  }
  return out;
}

/** The content of `<meta property="{property}">` (og:title, og:image), attributes in any order, or ''. */
function ogMeta(html, property) {
  const re = /<meta\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = parseAttributes(m[1]);
    if (attrs.property === property) return attrs.content || '';
  }
  return '';
}

const hasType = (node, types) => {
  const t = node?.['@type'];
  return (Array.isArray(t) ? t : [t]).some((x) => types.includes(x));
};

/** A schema.org `byArtist`, which Apple writes as one object or a list, as "A, B". */
function artistNames(byArtist) {
  const list = Array.isArray(byArtist) ? byArtist : byArtist ? [byArtist] : [];
  return list.map((a) => (typeof a?.name === 'string' ? a.name.trim() : '')).filter(Boolean).join(', ');
}

/**
 * Every track row in Apple's hydration payload (`serialized-server-data`), from every
 * `trackLockup` section in page order, as `{ title, artist }`. The payload is an enrichment:
 * if it is missing, is not JSON or has changed shape, this returns [] and never throws.
 */
export function appleTrackLockups(html) {
  const rows = [];
  for (const payload of parseJsonBlocks(scriptBodies(html, { id: 'serialized-server-data' }))) {
    const entries = Array.isArray(payload?.data) ? payload.data : [];
    for (const entry of entries) {
      const sections = Array.isArray(entry?.data?.sections) ? entry.data.sections : [];
      for (const section of sections) {
        if (section?.itemKind !== 'trackLockup' || !Array.isArray(section.items)) continue;
        for (const item of section.items) {
          if (typeof item?.title !== 'string') continue;
          const links = Array.isArray(item.subtitleLinks) ? item.subtitleLinks : [];
          const artist = links
            .map((l) => (typeof l?.title === 'string' ? l.title.trim() : ''))
            .filter(Boolean)
            .join(', ');
          rows.push({ title: item.title, artist });
        }
      }
    }
  }
  return rows;
}

/**
 * Pairs each ld+json track title with a payload row, in order, on `normalizeForComparison`.
 * A payload row that matches nothing is walked past, so one extra or missing row costs one
 * artist, never every artist after it. A track with no title match gets '' and is never
 * guessed. Returns one artist string per track.
 */
export function joinAppleArtists(trackTitles, lockups) {
  let next = 0;
  return trackTitles.map((title) => {
    const key = normalizeForComparison(title || '');
    if (!key) return '';
    for (let j = next; j < lockups.length; j++) {
      if (normalizeForComparison(lockups[j].title) === key) {
        next = j + 1;
        return lockups[j].artist;
      }
    }
    return '';
  });
}

const APPLE_SINGLE_TYPES = ['MusicRecording', 'MusicComposition'];
const APPLE_COLLECTION_TYPES = ['MusicPlaylist', 'MusicAlbum'];
const OG_SUFFIX = ' on Apple Music';

/**
 * The songs on one Apple Music page. Throws `ExtractionError` when the page holds no usable
 * ld+json for what the link names; a collection with no tracks never becomes a single song
 * standing in for it (D-14).
 */
export function parseAppleHtml(html, { isSingle }) {
  const blocks = parseJsonBlocks(scriptBodies(html, { type: 'application/ld+json' }));

  const thumbnail = ogMeta(html, 'og:image') || null;

  if (isSingle) {
    const song = blocks.find((b) => hasType(b, APPLE_SINGLE_TYPES) && typeof b.name === 'string' && b.name.trim());
    if (!song) throw new ExtractionError('Could not read that Apple Music song. Check that the link is public.');
    const name = song.name.replace(/\s+/g, ' ').trim();
    // The artist is read from og:title only in its exact form, anchored on the known title,
    // so "<name> by <artist> on Apple Music" can never be split in the wrong place. Apple
    // writes a no-break space in "Apple Music", so whitespace is compared as one space.
    const og = ogMeta(html, 'og:title').replace(/\s+/g, ' ').trim();
    const prefix = `${name} by `;
    const artist = og.startsWith(prefix) && og.endsWith(OG_SUFFIX)
      ? og.slice(prefix.length, og.length - OG_SUFFIX.length).trim()
      : '';
    return { title: artist ? `${name} by ${artist}` : name, songs: [{ title: name, channelTitle: artist, thumbnail }] };
  }

  const collection = blocks.find((b) => hasType(b, APPLE_COLLECTION_TYPES) || Array.isArray(b?.track) || Array.isArray(b?.tracks));
  // A playlist lists its songs under `track`, an album under `tracks`.
  const listed = collection?.track || collection?.tracks;
  const tracks = (Array.isArray(listed) ? listed : [])
    .filter((t) => typeof t?.name === 'string' && t.name.trim());
  if (tracks.length === 0) {
    throw new ExtractionError('Could not read the tracks of that Apple Music link. Check that it is public.');
  }

  const titles = tracks.map((t) => t.name.trim());
  const joined = joinAppleArtists(titles, appleTrackLockups(html));
  // An album's own artist is a provider field too; it fills any track the payload left bare.
  const albumArtist = artistNames(collection.byArtist);
  const songs = titles.map((title, i) => ({
    title,
    channelTitle: joined[i] || artistNames(tracks[i].byArtist) || albumArtist,
    thumbnail,
  }));
  const name = typeof collection.name === 'string' ? collection.name.trim() : '';
  return { title: name || 'Apple Music Collection', songs };
}

// Helper to fetch Apple Music playlist / album / song metadata
async function fetchAppleMusicEntity(url, isSingle) {
  const html = await fetchText(appleProviderUrl(url), APPLE_PAGE);
  return parseAppleHtml(html, { isSingle });
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
      return { title: data.title, platform: 'spotify', songs: data.songs, isSingleTrack: isSingle, counts: data.counts };
    }
    case 'apple': {
      const parsed = new URL(input.url);
      const isSingle = parsed.pathname.includes('/song/') || parsed.searchParams.has('i');
      const data = await fetchAppleMusicEntity(input.url, isSingle);
      return { title: data.title, platform: 'apple', songs: data.songs, isSingleTrack: isSingle };
    }
    case 'youtube': {
      const playlistId = extractPlaylistId(input.url);
      const videoId = extractVideoId(input.url);
      let data;
      if (playlistId) {
        try {
          data = await fetchPlaylistItems(playlistId);
        } catch (err) {
          // A Mix or radio list (watch?v=X&list=RD...) is not a readable playlist, but the
          // link still names a video. fetchPlaylistItems reports any failed read (a timeout
          // included) as an ExtractionError, so every unreadable list falls back to the video.
          if (!(err instanceof ExtractionError) || !videoId) throw err;
        }
      }
      if (data) {
        return {
          title: data.playlistTitle,
          platform: 'youtube',
          songs: data.songs,
          isSingleTrack: false,
          isDemo: data.isDemo,
          counts: {
            loadedCount: data.loadedCount,
            unavailableCount: data.unavailableCount,
            truncated: data.truncated,
            playlistLength: data.playlistLength,
            loadCap: data.loadCap,
          },
        };
      }
      if (!videoId) throw new ValidationError('That YouTube link is not a playlist or a video');
      const video = await fetchYouTubeSingleVideo(videoId);
      return { title: video.title, platform: 'youtube', songs: video.songs, isSingleTrack: true };
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
  const structured = STRUCTURED_PLATFORMS.has(result.platform);
  // F-46: a tag that repeats across the playlist is the uploader's house style, not part of
  // a song's name. Counted once here and shared by every track.
  const playlistTitles = cleanPlaylistTitles((result.songs || []).map((song) => song.title));
  const processedSongs = (result.songs || []).map((song, index) => {
    // Spotify and Apple hand over a real artist field; the cleaner must not split another
    // artist out of the title when one is there. YouTube and a typed query have none.
    const cleaned = cleanSongTitle(song.title, song.channelTitle, {
      source: result.platform,
      ...(structured ? { providerArtist: song.channelTitle || '' } : {}),
      playlistTitles,
    });
    return {
      ...song,
      // Only a provider id is set here. A row with none gets its id in page.js, the one
      // place ids are made, and is deduped on title and artist (songKey in song.js).
      id: song.id || null,
      index: index + 1,
      position: index,
      // Where the metadata came from. Spotify/Apple hand us a real artist field, so the
      // matcher may trust it enough to reject on; a YouTube channel name it may not.
      source: result.platform,
      cleanQuery: cleaned.cleanQuery,
      extractedArtist: cleaned.artist,
      // True when that artist was split out of the title text rather than handed over by
      // the provider, so the matcher must not give it a provider's trust.
      artistFromTitle: cleaned.artistFromTitle,
      extractedTitle: cleaned.title,
      // The title with its ambiguous tags kept, or '' when that is the same (F-46).
      altTitle: cleaned.altTitle,
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
    ...windowCounts(result, processedSongs.length),
  };
}

/**
 * What the page reports about the fetched playlist. A YouTube or Spotify playlist can hold
 * unavailable items; only a YouTube one can be cut short (at its `loadCap`, youtube.js
 * PLAYLIST_LOAD_CAP). Every other source returns all it read and states no separate length or cap.
 */
function windowCounts(result, returnedCount) {
  const counts = result.counts || {};
  return {
    returnedCount,
    loadedCount: counts.loadedCount ?? returnedCount,
    unavailableCount: counts.unavailableCount ?? 0,
    truncated: counts.truncated ?? false,
    playlistLength: counts.playlistLength ?? null,
    loadCap: counts.loadCap ?? null,
  };
}
