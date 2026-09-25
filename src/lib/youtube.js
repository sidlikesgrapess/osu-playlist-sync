/**
 * Zero-Key YouTube & YouTube Music Playlist Extractor.
 * Extracts song titles, artists, and thumbnails directly from any public or unlisted
 * playlist URL without requiring any Google Account sign-in or API keys.
 */

import { fetchText, postJson } from './http.js';

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
 * How many playlist items are loaded at most. YouTube sends them 100 to a response, so this
 * is the first window plus up to four continuation pages. It goes to the client as
 * `loadCap`, which is where the truncation popup takes its number from.
 */
export const PLAYLIST_LOAD_CAP = 500;

// Continuation pages are fetched one at a time, this far apart, and the whole walk stops at
// the deadline so a slow YouTube cannot run /api/playlist into its function timeout. A walk
// that stops early keeps what it loaded and reports `truncated`.
const CONTINUATION_GAP_MS = 750;
const PLAYLIST_WALK_DEADLINE_MS = 20_000;

const INNERTUBE_BROWSE = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false';
const INNERTUBE_CLIENT_VERSION = '2.20240101.01.00';
const INNERTUBE_REQUEST = {
  profile: 'browserLike',
  timeoutMs: INNERTUBE_TIMEOUT_MS,
  maxBytes: YOUTUBE_PAGE.maxBytes,
  headers: { 'X-YouTube-Client-Name': '1', 'X-YouTube-Client-Version': INNERTUBE_CLIENT_VERSION },
};
const INNERTUBE_CONTEXT = {
  client: { clientName: 'WEB', clientVersion: INNERTUBE_CLIENT_VERSION, hl: 'en', gl: 'US' },
};

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches the songs of a public/unlisted YouTube playlist: the first window, then each
 * continuation page in turn, one paced request per extra 100 items, until there is no
 * continuation token or `maxVideos` items are loaded.
 *
 * Returns the songs plus the counts the page reports:
 * - `loadedCount`: video items across every loaded page, plus any YouTube hid from them,
 * - `returnedCount`: songs kept from them,
 * - `unavailableCount`: items YouTube marks unplayable (private, deleted, blocked), plus
 *   items it leaves out of the playlist entirely (see `finishWalk`),
 * - `truncated`: items exist beyond what was loaded (a continuation not followed, or the
 *   `maxVideos` cap cutting a page short),
 * - `playlistLength`: the real length when the header states it, else `null`,
 * - `loadCap`: the `maxVideos` the walk ran under.
 *
 * Throws `ExtractionError` when neither Innertube nor the page scrape yields a playlist. It
 * never substitutes sample songs for a playlist it could not read (F-07). A continuation
 * page that fails is not an error: the songs already loaded come back, `truncated`.
 *
 * @param {string} playlistId - Extracted YouTube playlist ID
 * @param {number} [maxVideos=PLAYLIST_LOAD_CAP]
 * @param {{ sleep?: (ms: number) => Promise<void>, now?: () => number }} [clock] - for tests
 */
export async function fetchPlaylistItems(playlistId, maxVideos = PLAYLIST_LOAD_CAP, { sleep = realSleep, now = Date.now } = {}) {
  if (!playlistId || !PLAYLIST_ID.test(playlistId)) {
    throw new ExtractionError('Please provide a valid YouTube playlist URL');
  }

  // The sample playlist offered by the input box is a preset, asked for by its id.
  if (playlistId === 'PLosu_banger_showcase_01' || playlistId === 'DEMO_PLAYLIST_ID') {
    return getDemoPlaylist();
  }

  const deadline = now() + PLAYLIST_WALK_DEADLINE_MS;
  const attempts = [
    ['Innertube', () => fetchFromInnertube(playlistId)],
    ['HTML scrape', () => fetchFromHtmlScrape(playlistId)],
  ];
  for (const [name, load] of attempts) {
    try {
      const first = await load();
      const walk = startWalk(first, maxVideos);
      addPage(walk, playlistWindow(first));
      if (walk.loadedCount === 0) {
        console.warn(`[YouTube Extractor] ${name} returned no playlist items`);
        continue;
      }
      // Both paths carry the same continuation token, so the page scrape pages on through
      // Innertube exactly as the Innertube path does.
      await followContinuations(walk, { sleep, now, deadline });
      const parsed = finishWalk(walk);
      return { playlistId, totalSongs: parsed.returnedCount, isDemo: false, ...parsed };
    } catch (err) {
      console.warn(`[YouTube Extractor] ${name} attempt error:`, err.message);
    }
  }

  throw new ExtractionError('Could not read that YouTube playlist. Check that it is public or unlisted.');
}

/**
 * Fetch continuation pages into `walk` while it holds a token and has room. Every early stop
 * (the deadline, a failed or unreadable page) leaves the walk open ended, which is what
 * makes the result `truncated`; so does stopping at the cap with a token still in hand.
 */
async function followContinuations(walk, { sleep, now, deadline }) {
  while (walk.token && !walkIsFull(walk)) {
    if (now() + CONTINUATION_GAP_MS >= deadline) {
      console.warn('[YouTube Extractor] playlist walk deadline reached');
      return;
    }
    await sleep(CONTINUATION_GAP_MS);
    if (now() >= deadline) {
      console.warn('[YouTube Extractor] playlist walk deadline reached');
      return;
    }
    let items;
    try {
      const timeoutMs = Math.max(1, Math.min(INNERTUBE_TIMEOUT_MS, deadline - now()));
      items = continuationWindow(await postJson(
        INNERTUBE_BROWSE,
        { context: INNERTUBE_CONTEXT, continuation: walk.token },
        { ...INNERTUBE_REQUEST, timeoutMs },
      ));
    } catch (err) {
      console.warn('[YouTube Extractor] continuation page error:', err.message);
      return;
    }
    if (!items) {
      console.warn('[YouTube Extractor] continuation page held no items');
      return;
    }
    addPage(walk, items);
  }
}

/** The browse response for a playlist, from the Innertube API. */
function fetchFromInnertube(playlistId) {
  const browseId = playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`;
  return postJson(INNERTUBE_BROWSE, { context: INNERTUBE_CONTEXT, browseId }, INNERTUBE_REQUEST);
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
 * The item list of a continuation response, from every `appendContinuationItemsAction` it
 * carries, or null when it carries none (a shape we cannot read, never "no more items").
 */
function continuationWindow(data) {
  const actions = Array.isArray(data?.onResponseReceivedActions) ? data.onResponseReceivedActions : [];
  const lists = actions
    .map((a) => a?.appendContinuationItemsAction?.continuationItems)
    .filter(Array.isArray);
  return lists.length > 0 ? lists.flat() : null;
}

/** The first `continuationCommand.token` anywhere under `node`, depth first, or null. */
function findContinuationToken(node) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const token = findContinuationToken(child);
      if (token) return token;
    }
  } else if (node && typeof node === 'object') {
    const token = node.continuationCommand?.token;
    if (typeof token === 'string' && token) return token;
    for (const value of Object.values(node)) {
      const found = findContinuationToken(value);
      if (found) return found;
    }
  }
  return null;
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
 * A playlist being read page by page. `openEnded` says the last page read ended in a
 * continuation, and `token` is that continuation's token when it carried a usable one.
 */
function startWalk(first, maxVideos) {
  return {
    maxVideos,
    playlistTitle: first?.header?.playlistHeaderRenderer?.title?.simpleText ||
                   first?.header?.pageHeaderRenderer?.pageTitle ||
                   first?.metadata?.playlistMetadataRenderer?.title ||
                   'YouTube Playlist',
    playlistLength: readPlaylistLength(first?.header),
    songs: [],
    loadedCount: 0,
    unavailableCount: 0,
    cut: false,
    openEnded: false,
    token: null,
  };
}

const walkIsFull = (walk) => walk.loadedCount >= walk.maxVideos;

/** Read one page of items into the walk. Positions run on across pages, never from 0. */
function addPage(walk, items) {
  walk.openEnded = false;
  walk.token = null;
  for (const item of items) {
    if (item?.continuationItemRenderer) {
      walk.openEnded = true;
      walk.token = findContinuationToken(item.continuationItemRenderer);
      continue;
    }
    const read = readWindowItem(item, walk.loadedCount);
    if (!read) continue;
    if (walkIsFull(walk)) {
      walk.cut = true;
      continue;
    }
    walk.loadedCount++;
    if (read.unavailable) walk.unavailableCount++;
    else walk.songs.push(read.song);
  }
}

/**
 * The walk as songs and counts. `truncated` is structural: the last page read ended in a
 * continuation that was not followed (the cap, the deadline or a failed page stopped the
 * walk there), or the cap cut a page short with items left. It never depends on the
 * length text.
 */
function finishWalk(walk) {
  const truncated = walk.cut || walk.openEnded;
  const { playlistLength } = walk;
  let { loadedCount, unavailableCount } = walk;

  // YouTube can drop unavailable videos from the playlist altogether, leaving only an alert
  // ("4 unavailable videos are hidden") that is locale dependent and never parsed. The
  // header length still counts them, so once every page is loaded the shortfall is exactly
  // the hidden items. A truncated walk cannot tell hidden items from ones not yet loaded,
  // and an empty one may be a shape we failed to read, so neither infers anything.
  if (!truncated && loadedCount > 0 && playlistLength > loadedCount) {
    unavailableCount += playlistLength - loadedCount;
    loadedCount = playlistLength;
  }

  return {
    playlistTitle: walk.playlistTitle,
    songs: walk.songs,
    returnedCount: walk.songs.length,
    loadedCount,
    unavailableCount,
    truncated,
    playlistLength,
    loadCap: walk.maxVideos,
  };
}

/**
 * A browse response (Innertube or `ytInitialData`, which share a shape) as songs and counts,
 * with the continuation responses already fetched for it read on after it, in order. This
 * is the network free half of `fetchPlaylistItems`: the same walk, the same counts.
 */
export function parsePlaylistData(data, maxVideos = PLAYLIST_LOAD_CAP, continuationPages = []) {
  const walk = startWalk(data, maxVideos);
  addPage(walk, playlistWindow(data));
  for (const page of continuationPages) {
    if (!walk.token || walkIsFull(walk)) break;
    const items = continuationWindow(page);
    if (!items) break;
    addPage(walk, items);
  }
  return finishWalk(walk);
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
    loadCap: PLAYLIST_LOAD_CAP,
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
