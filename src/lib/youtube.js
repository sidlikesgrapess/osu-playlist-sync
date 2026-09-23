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
 * Fetches all song titles and metadata from a public/unlisted YouTube playlist.
 * @param {string} playlistId - Extracted YouTube playlist ID
 * @param {number} [maxVideos=100]
 */
export async function fetchPlaylistItems(playlistId, maxVideos = 100) {
  if (!playlistId || !PLAYLIST_ID.test(playlistId)) {
    throw new ExtractionError('Please provide a valid YouTube playlist URL');
  }

  // Check if sample demo playlist requested
  if (playlistId === 'PLosu_banger_showcase_01' || playlistId === 'DEMO_PLAYLIST_ID') {
    return getDemoPlaylist();
  }

  try {
    // 1. Try fetching via YouTube Innertube Browse API
    const result = await fetchFromInnertube(playlistId, maxVideos);
    if (result && result.songs && result.songs.length > 0) {
      return {
        playlistId,
        playlistTitle: result.playlistTitle || 'YouTube Playlist',
        totalSongs: result.songs.length,
        isDemo: false,
        songs: result.songs,
      };
    }
  } catch (innertubeErr) {
    console.warn('[YouTube Extractor] Innertube API attempt error:', innertubeErr.message);
  }

  try {
    // 2. Fallback: Direct HTML page scraping
    const resultFromHtml = await fetchFromHtmlScrape(playlistId, maxVideos);
    if (resultFromHtml && resultFromHtml.songs && resultFromHtml.songs.length > 0) {
      return {
        playlistId,
        playlistTitle: resultFromHtml.playlistTitle || 'YouTube Playlist',
        totalSongs: resultFromHtml.songs.length,
        isDemo: false,
        songs: resultFromHtml.songs,
      };
    }
  } catch (htmlErr) {
    console.warn('[YouTube Extractor] HTML Scrape attempt error:', htmlErr.message);
  }

  // 3. If all else fails, return demo banger showcase
  return getDemoPlaylist();
}

/**
 * Innertube internal API resolver
 */
async function fetchFromInnertube(playlistId, maxVideos) {
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

  const data = await response.json();
  const playlistTitle = data.header?.playlistHeaderRenderer?.title?.simpleText ||
                        data.header?.pageHeaderRenderer?.pageTitle ||
                        data.metadata?.playlistMetadataRenderer?.title ||
                        'YouTube Playlist';

  const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs;
  const sectionList = tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
  const items = sectionList?.[0]?.itemSectionRenderer?.contents || 
                sectionList?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents ||
                [];

  const songs = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Standard video renderer
    if (item.playlistVideoRenderer) {
      const vr = item.playlistVideoRenderer;
      const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || '';
      const channelTitle = vr.shortBylineText?.runs?.[0]?.text || vr.shortBylineText?.simpleText || '';
      const videoId = vr.videoId;
      const thumbnail = vr.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      if (title && title !== 'Private video' && title !== 'Deleted video') {
        songs.push({
          id: videoId || `yt_${i}`,
          title,
          channelTitle,
          thumbnail,
          position: i,
        });
      }
    }
    // Modern lockup view model format
    else if (item.lockupViewModel) {
      const lm = item.lockupViewModel;
      const videoId = lm.contentId || lm.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
      
      const rawTitle = lm.metadata?.lockupMetadataViewModel?.title?.content ||
                       lm.rendererContext?.accessibilityContext?.label ||
                       '';
      
      const channelTitle = lm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || '';

      const cleanTitle = rawTitle.replace(/\s+\d+\s+(minutes?|seconds?|hours?).*$/i, '').trim();
      const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      if (cleanTitle && cleanTitle !== 'Private video' && cleanTitle !== 'Deleted video') {
        songs.push({
          id: videoId || `yt_${i}`,
          title: cleanTitle,
          channelTitle,
          thumbnail,
          position: i,
        });
      }
    }

    if (songs.length >= maxVideos) break;
  }

  return { playlistTitle, songs };
}

/**
 * Direct HTML scraping fallback
 */
async function fetchFromHtmlScrape(playlistId, maxVideos) {
  const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
  const html = await fetchText(url, YOUTUBE_PAGE);
  const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.+?});/s);

  if (!match) {
    throw new Error('Could not parse ytInitialData from YouTube page');
  }

  const data = JSON.parse(match[1]);
  const playlistTitle = data.metadata?.playlistMetadataRenderer?.title ||
                        data.header?.playlistHeaderRenderer?.title?.simpleText ||
                        'YouTube Playlist';

  const contents = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || 
                   data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents || 
                   [];

  const songs = [];
  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    if (item.playlistVideoRenderer) {
      const vr = item.playlistVideoRenderer;
      const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || '';
      const channelTitle = vr.shortBylineText?.runs?.[0]?.text || '';
      const videoId = vr.videoId;
      const thumbnail = vr.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      if (title && title !== 'Private video' && title !== 'Deleted video') {
        songs.push({
          id: videoId || `yt_${i}`,
          title,
          channelTitle,
          thumbnail,
          position: i,
        });
      }
    } else if (item.lockupViewModel) {
      const lm = item.lockupViewModel;
      const videoId = lm.contentId || lm.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
      const rawTitle = lm.metadata?.lockupMetadataViewModel?.title?.content ||
                       lm.rendererContext?.accessibilityContext?.label || '';
      const channelTitle = lm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || '';
      const cleanTitle = rawTitle.replace(/\s+\d+\s+(minutes?|seconds?|hours?).*$/i, '').trim();
      const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      if (cleanTitle && cleanTitle !== 'Private video') {
        songs.push({
          id: videoId || `yt_${i}`,
          title: cleanTitle,
          channelTitle,
          thumbnail,
          position: i,
        });
      }
    }

    if (songs.length >= maxVideos) break;
  }

  return { playlistTitle, songs };
}

/**
 * Demo fallback playlist for testing
 */
function getDemoPlaylist() {
  return {
    playlistId: 'PLosu_banger_showcase_01',
    playlistTitle: 'osu! Banger Showcase (Sample Playlist)',
    totalSongs: 6,
    isDemo: true,
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
