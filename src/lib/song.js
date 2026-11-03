/**
 * The central "song object" contract (CLAUDE.md): built and merged in one place instead of
 * the ad hoc object literals scattered across `extractors.js`, `page.js`'s `beatmapToSong`
 * and any future player adapter, so every entry path produces the same shape with the same
 * rest-state defaults.
 */

import { cleanSongTitle, cleanPlaylistTitles } from './titleCleaner.js';

// Every valid source, with what a row says about where it came from when it has no artist.
const SOURCE_LABELS = {
  spotify: 'Spotify track',
  apple: 'Apple Music track',
  youtube: 'YouTube video',
  query: 'Typed search',
  'osu-player': 'osu! beatmap',
};

const VALID_SOURCES = Object.keys(SOURCE_LABELS);

/** The line under a row's title: its artist or channel, else where the song came from. */
export const songSubtitle = (song) => song?.channelTitle || SOURCE_LABELS[song?.source] || '';

/**
 * Builds one song object. `source` is required and must be one of `VALID_SOURCES` -- it is
 * load-bearing (CLAUDE.md: it decides whether the artist gate can reject a candidate), so a
 * song can never be constructed without one. Every other field defaults to the shape's rest
 * state, and the caller's own fields are spread last, so a caller can override any default
 * but can never silently omit `source`.
 */
export function makeSong(input = {}) {
  const { source } = input;
  if (!VALID_SOURCES.includes(source)) {
    throw new Error(
      `makeSong: source must be one of ${VALID_SOURCES.join(', ')}, got ${JSON.stringify(source)}`
    );
  }

  return {
    id: null,
    index: 0,
    title: '',
    channelTitle: '',
    thumbnail: null,
    duration: null,
    cleanQuery: '',
    extractedTitle: '',
    extractedArtist: '',
    // F-46: the title with its ambiguous tags kept, when that differs from extractedTitle.
    altTitle: '',
    fallbacks: [],
    queries: [],
    hasSearched: false,
    isSearching: false,
    matchedBeatmap: null,
    allMatches: [],
    rejection: null,
    // The uploaded file the song was read from (exportify.js), else null.
    sourceFile: null,
    ...input,
  };
}

// Sources whose tracks carry the provider's own artist field.
const STRUCTURED_PLATFORMS = new Set(['spotify', 'apple']);

/**
 * The /api/playlist answer for one read playlist: every track cleaned for osu! matching,
 * plus what the page reports about the read. Runs on the server for a pasted link
 * (extractMusicData) and in the browser for an uploaded CSV (exportify.js), so both land
 * in the page as the same shape.
 * @param {{ platform: string, title: string, songs: object[], isSingleTrack?: boolean, isDemo?: boolean, counts?: object }} result
 */
export function preparePlaylist(result) {
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
      // place ids are made, and is deduped on title and artist (songKey below).
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
 * What the page reports about the read playlist. A YouTube or Spotify playlist can hold
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

/**
 * A page of rows split into runs of consecutive songs from the same uploaded file
 * (`sourceFile`), so the table can group each file's songs under its name. Rows that came any
 * other way form runs with `sourceFile: null`, which get no heading or stripe.
 */
export function fileRuns(songs) {
  const runs = [];
  for (const song of songs) {
    const sourceFile = song.sourceFile || null;
    const last = runs[runs.length - 1];
    if (last && last.sourceFile === sourceFile) last.songs.push(song);
    else runs.push({ sourceFile, songs: [song] });
  }
  return runs;
}

// extractors.js's fallback id for a row with no provider id of its own: `track_<index>_<Date.now()>`.
// Stable per extraction, not across two extractions of the same playlist, so it must never
// be trusted as identity -- title+artist stands in for it instead.
const PLACEHOLDER_ID_RE = /^track_\d+_\d+$/;

/**
 * A song's dedupe identity. Most ids are already stable per source (YouTube's videoId,
 * `osu_<beatmapsetId>`), so those are trusted outright. The extractor's placeholder id
 * shape is recognised and never trusted for identity, since a re-extraction of the same
 * playlist gets a fresh timestamp every time.
 */
export const songKey = (song) => {
  const id = song?.id;
  if (id && !PLACEHOLDER_ID_RE.test(String(id))) {
    return `id:${id}`;
  }
  const title = String(song?.extractedTitle || song?.title || '').trim().toLowerCase();
  const artist = String(song?.extractedArtist || '').trim().toLowerCase();
  return `ta:${title}|${artist}`;
};

/**
 * Merges a freshly extracted batch into the songs already on the page (today's inline
 * version lives at `page.js:225-232`, keyed on `id` alone). An existing row always wins
 * over an incoming one with the same identity -- a re-extraction must never clobber a
 * match, a selection or any other UI state already built up on that row -- and `position`
 * is assigned only to the rows actually being added, continuing on from however many rows
 * already exist. Duplicates within `incoming` itself are also caught, not just against
 * `existing`.
 */
export function mergeSongs(existing, incoming) {
  const seen = new Set(existing.map((s) => songKey(s)));
  const additions = [];
  let skipped = 0;

  for (const song of incoming) {
    const key = songKey(song);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    additions.push(song);
  }

  const positioned = additions.map((song, i) => ({ ...song, position: existing.length + i }));

  return {
    songs: [...existing, ...positioned],
    added: positioned.length,
    skipped,
  };
}
