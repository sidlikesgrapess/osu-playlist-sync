/**
 * Zero-Key YouTube & YouTube Music Playlist Extractor.
 * Extracts song titles, artists, and thumbnails directly from any public or unlisted
 * playlist URL without requiring any Google Account sign-in or API keys.
 */

import { fetchText, UA_PROFILES } from './http.js';

/**
 * A provider could not be read: the page or payload was unavailable, private, or its shape
 * changed. The playlist route turns it into a 502 with `extractionFailed: true`. Its message
 * is written for the user and never carries an upstream URL.
 */
export class ExtractionError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ExtractionError';
    this.status = 502;
  }
}

// Playlist and video ids are the only caller text that reaches a YouTube URL, so each is
// held to the id alphabet before it is used.
const PLAYLIST_ID = /^[A-Za-z0-9_-]{2,64}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// The playlist page embeds the whole first window of items as JSON, so it is big.
const YOUTUBE_PAGE = { profile: 'browserLike', maxBytes: 5_000_000 };
const INNERTUBE_TIMEOUT_MS = 8000;

/**
 * Extracts a playlist ID from various YouTube and YouTube Music URL formats.
 * @param {string} urlOrId
 * @returns {string|null}
 */
export function extractPlaylistId(urlOrId) {
  if (!urlOrId || typeof urlOrId !== 'string') return null;

  const trimmed = urlOrId.trim();

  // Direct ID check (e.g., PLJU2iuLr5pzw3qUnvmxiOaY2dwBxGSMSM)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const listParam = url.searchParams.get('list');
    if (listParam) return listParam;

    const pathParts = url.pathname.split('/');
    if (pathParts.includes('playlist')) {
      const idx = pathParts.indexOf('playlist');
      if (pathParts[idx + 1]) return pathParts[idx + 1];
    }
  } catch (e) {
    const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
  }

  return null;
}

/**
 * The video id of a single-video YouTube URL (`watch?v=`, `youtu.be/<id>`, `/shorts/<id>`,
 * `/embed/<id>`, `/live/<id>`), or null when the URL names no video.
 * @param {string} url
 * @returns {string|null}
 */
export function extractVideoId(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const segments = parsed.pathname.split('/').filter(Boolean);
  let candidate = parsed.searchParams.get('v');
  if (!candidate && parsed.hostname.toLowerCase().replace(/\.$/, '') === 'youtu.be') {
    candidate = segments[0];
  }
  if (!candidate && ['shorts', 'embed', 'live'].includes(segments[0])) {
    candidate = segments[1];
  }
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

/**
 * Fetches the songs of a public/unlisted YouTube playlist: its first window only, which the
 * browse response holds as up to 100 items. Continuations are never fetched; `truncated`
 * says when there were more.
 *
 * Returns the songs plus the counts the page reports:
 * - `loadedCount`: video items in the fetched window,
 * - `returnedCount`: songs kept from them,
 * - `unavailableCount`: items YouTube marks unplayable (private, deleted, blocked),
 * - `truncated`: the window ends in a continuation, or the `maxVideos` cap cut it short,
 * - `playlistLength`: the real length when the header states it, else `null`.
 *
 * Throws `ExtractionError` when neither Innertube nor the page scrape yields a playlist. It
 * never substitutes sample songs for a playlist it could not read (F-07).
 *
 * @param {string} playlistId - Extracted YouTube playlist ID
 * @param {number} [maxVideos=100]
 */
export async function fetchPlaylistItems(playlistId, maxVideos = 100) {
  if (!playlistId || !PLAYLIST_ID.test(playlistId)) {
    throw new ExtractionError('Please provide a valid YouTube playlist URL');
  }

  // The sample playlist offered by the input box is a preset, asked for by its id.
  if (playlistId === 'PLosu_banger_showcase_01' || playlistId === 'DEMO_PLAYLIST_ID') {
    return getDemoPlaylist();
  }

  const attempts = [
    ['Innertube', () => fetchFromInnertube(playlistId)],
    ['HTML scrape', () => fetchFromHtmlScrape(playlistId)],
  ];
  for (const [name, load] of attempts) {
    try {
      const parsed = parsePlaylistData(await load(), maxVideos);
      if (parsed.loadedCount > 0) {
        return { playlistId, totalSongs: parsed.returnedCount, isDemo: false, ...parsed };
      }
      console.warn(`[YouTube Extractor] ${name} returned no playlist items`);
    } catch (err) {
      console.warn(`[YouTube Extractor] ${name} attempt error:`, err.message);
    }
  }

  throw new ExtractionError('Could not read that YouTube playlist. Check that it is public or unlisted.');
}

/** The browse response for a playlist, from the Innertube API. */
async function fetchFromInnertube(playlistId) {
  const browseId = playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`;

  // The one outbound call that cannot go through http.js: Innertube browse is a POST with a
  // JSON body, and http.js only issues GETs. It still takes its UA from UA_PROFILES and
  // carries the same timeout; it has no byte cap until http.js can send a body.
  const response = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(INNERTUBE_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA_PROFILES.browserLike,
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': '2.20240101.01.00',
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20240101.01.00',
          hl: 'en',
          gl: 'US',
        },
      },
      browseId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Innertube request returned HTTP ${response.status}`);
  }
  return response.json();
}

/** The same browse data, as `ytInitialData` embedded in the playlist page. */
async function fetchFromHtmlScrape(playlistId) {
  const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
  const html = await fetchText(url, YOUTUBE_PAGE);
  const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.+?});/s);

  if (!match) {
    throw new Error('Could not parse ytInitialData from YouTube page');
  }
  return JSON.parse(match[1]);
}

const PLAYLIST_LENGTH = /^([\d,]+) videos?$/;

/** Every `metadataParts` entry anywhere under `node`, depth first. */
function collectMetadataParts(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectMetadataParts(child, out);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'metadataParts' && Array.isArray(value)) out.push(...value);
      else collectMetadataParts(value, out);
    }
  }
  return out;
}

/**
 * The playlist's real length from its header text ("200 videos"), or null. Every
 * `metadataParts` entry is scanned, because header shapes differ between playlists and the
 * count is not always in the same row.
 */
export function readPlaylistLength(header) {
  for (const part of collectMetadataParts(header)) {
    const text = part?.text?.content ?? part?.text?.simpleText ?? (typeof part?.text === 'string' ? part.text : '');
    const match = typeof text === 'string' ? text.trim().match(PLAYLIST_LENGTH) : null;
    if (match) return Number(match[1].replace(/,/g, ''));
  }
  return null;
}

/**
 * The item list of the first window. It is either the item section's own contents or, on
 * the older shape, the contents of the one `playlistVideoListRenderer` inside it.
 */
function playlistWindow(data) {
  const section = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
    ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
  if (!Array.isArray(section)) return [];
  const nested = section.find((x) => x?.playlistVideoListRenderer)?.playlistVideoListRenderer?.contents;
  return Array.isArray(nested) ? nested : section;
}

/**
 * One window item as `{ song }`, `{ unavailable: true }`, or null when it is not a video item
 * at all. Unavailability is read from the renderer's own fields, never from the title text
 * (D-14): YouTube marks an unplayable entry `isPlayable: false`, and a `playlistVideoRenderer`
 * for a private or deleted video carries no `lengthSeconds`.
 */
function readWindowItem(item, position) {
  if (item?.playlistVideoRenderer) {
    const vr = item.playlistVideoRenderer;
    const videoId = vr.videoId;
    const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || '';
    if (vr.isPlayable === false || !vr.lengthSeconds || !videoId || !title) return { unavailable: true };
    return {
      song: {
        id: videoId,
        title,
        channelTitle: vr.shortBylineText?.runs?.[0]?.text || vr.shortBylineText?.simpleText || '',
        thumbnail: vr.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        position,
      },
    };
  }
  if (item?.lockupViewModel) {
    const lm = item.lockupViewModel;
    const videoId = lm.contentId || lm.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
    const rawTitle = lm.metadata?.lockupMetadataViewModel?.title?.content ||
                     lm.rendererContext?.accessibilityContext?.label || '';
    // The accessibility label ends in a spoken duration ("... 3 minutes, 2 seconds").
    const title = rawTitle.replace(/\s+\d+\s+(minutes?|seconds?|hours?).*$/i, '').trim();
    if (lm.isPlayable === false || !videoId || !title) return { unavailable: true };
    return {
      song: {
        id: videoId,
        title,
        channelTitle: lm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || '',
        // A lockup never carries a usable thumbnail URL, so it is always built from the id.
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        position,
      },
    };
  }
  return null;
}

/**
 * A browse response (Innertube or `ytInitialData`, which share a shape) as songs and counts.
 * `truncated` is structural: a `continuationItemRenderer` in the window, or the `maxVideos`
 * cap stopping the walk with items left. It never depends on the length text.
 */
export function parsePlaylistData(data, maxVideos = 100) {
  const playlistTitle = data?.header?.playlistHeaderRenderer?.title?.simpleText ||
                        data?.header?.pageHeaderRenderer?.pageTitle ||
                        data?.metadata?.playlistMetadataRenderer?.title ||
                        'YouTube Playlist';
  const items = playlistWindow(data);

  const songs = [];
  let loadedCount = 0;
  let unavailableCount = 0;
  let truncated = false;

  for (let i = 0; i < items.length; i++) {
    if (items[i]?.continuationItemRenderer) {
      truncated = true;
      continue;
    }
    if (songs.length >= maxVideos) {
      if (readWindowItem(items[i], i)) truncated = true;
      continue;
    }
    const read = readWindowItem(items[i], i);
    if (!read) continue;
    loadedCount++;
    if (read.unavailable) unavailableCount++;
    else songs.push(read.song);
  }

  return {
    playlistTitle,
    songs,
    returnedCount: songs.length,
    loadedCount,
    unavailableCount,
    truncated,
    playlistLength: readPlaylistLength(data?.header),
  };
}

/**
 * The preset sample playlist, returned only when its own id is asked for.
 */
function getDemoPlaylist() {
  return {
    playlistId: 'PLosu_banger_showcase_01',
    playlistTitle: 'osu! Banger Showcase (Sample Playlist)',
    totalSongs: 6,
    isDemo: true,
    returnedCount: 6,
    loadedCount: 6,
    unavailableCount: 0,
    truncated: false,
    playlistLength: 6,
    songs: [
      {
        id: 'dQw4w9WgXcQ',
        title: 'Camellia - GHOST (Official Audio) [HQ 4K]',
        channelTitle: 'Camellia Official',
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        position: 0,
      },
      {
        id: '2g811Eo7K8U',
        title: 'DragonForce - Through the Fire and Flames (Official Music Video)',
        channelTitle: 'DragonForce',
        thumbnail: 'https://i.ytimg.com/vi/2g811Eo7K8U/hqdefault.jpg',
        position: 1,
      },
      {
        id: 'shs0rAiN38o',
        title: 'KuroUsaP feat. Hatsune Miku - Senbonzakura (MV)',
        channelTitle: 'WhiteFlame Official',
        thumbnail: 'https://i.ytimg.com/vi/shs0rAiN38o/hqdefault.jpg',
        position: 2,
      },
      {
        id: '4TWC39UmFQ4',
        title: 'Xi - FREEDOM DiVE (Official Audio)',
        channelTitle: 'Diverse System',
        thumbnail: 'https://i.ytimg.com/vi/4TWC39UmFQ4/hqdefault.jpg',
        position: 3,
      },
      {
        id: 'fJ9rUzIMcZQ',
        title: 'YOASOBI - Idol (Official Music Video)',
        channelTitle: 'Ayase / YOASOBI',
        thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg',
        position: 4,
      },
      {
        id: '3JZ4pnNfyxQ',
        title: 'Kenshi Yonezu - Kick Back (Official Video)',
        channelTitle: 'Kenshi Yonezu',
        thumbnail: 'https://i.ytimg.com/vi/3JZ4pnNfyxQ/hqdefault.jpg',
        position: 5,
      },
    ],
  };
}
