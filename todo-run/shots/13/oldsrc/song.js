/**
 * The central "song object" contract (CLAUDE.md): built and merged in one place instead of
 * the ad hoc object literals scattered across `extractors.js`, `page.js`'s `beatmapToSong`
 * and any future player adapter, so every entry path produces the same shape with the same
 * rest-state defaults.
 */

const VALID_SOURCES = ['spotify', 'apple', 'youtube', 'query', 'osu-player'];

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
    fallbacks: [],
    queries: [],
    hasSearched: false,
    isSearching: false,
    matchedBeatmap: null,
    allMatches: [],
    rejection: null,
    ...input,
  };
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
