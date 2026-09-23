/**
 * A player's collections (best, most played, favourites) as the page shows them. Client safe:
 * the server hands over the normalized, undeduped window once, and every mode or status
 * change after that is applied here, in memory, with no osu! call (F-12). The one exception
 * is a mode change on `best`, whose upstream endpoint filters by ruleset itself.
 */
import { isRankedStatus } from './beatmapFormat.js';
import { makeSong } from './song.js';

/**
 * What makes two beatmapsets the same row. Shared by this dedupe and the search pool's in
 * osu.js (F-41); the two dedupes stay separate because they merge different shapes.
 */
export const beatmapsetKey = (set) => set.id;

/**
 * Applies the UI's mode / status filters to a normalized beatmapset. osu! only supports a
 * mode filter natively on score endpoints, so the collection endpoints are filtered here.
 */
export function matchesCollectionFilters(beatmapset, mode, status) {
  if (status === 'ranked' && !isRankedStatus(beatmapset.status)) {
    return false;
  }

  if (mode && mode !== 'all') {
    const modes = (beatmapset.difficulties || []).map(d => d.mode).filter(Boolean);
    if (modes.length > 0 && !modes.includes(mode)) return false;
  }

  return true;
}

/**
 * The `best` and `most_played` endpoints return one entry per *difficulty*, so a set the
 * player has several scores or playcounts on comes back several times. Everything
 * downstream (selection, export, download) is keyed by beatmapset, so those rows are
 * indistinguishable duplicates: collapse them into one entry that keeps the strongest score
 * and every difficulty the player touched.
 */
export function dedupeByBeatmapset(entries) {
  const byKey = new Map();

  entries.forEach(entry => {
    const key = beatmapsetKey(entry.beatmapset);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeBeatmapsetEntries(existing, entry) : entry);
  });

  return [...byKey.values()];
}

export function mergeBeatmapsetEntries(a, b) {
  // The higher-pp score wins the row (rank badge, accuracy, mods); playcounts are
  // per-difficulty, so they add up to the player's total on the set.
  const primary = (b.meta?.pp || 0) > (a.meta?.pp || 0) ? b : a;
  const other = primary === a ? b : a;

  const difficulties = [...(primary.beatmapset.difficulties || [])];
  const seenDiffs = new Set(difficulties.map(d => d.id));
  (other.beatmapset.difficulties || []).forEach(d => {
    if (!seenDiffs.has(d.id)) {
      seenDiffs.add(d.id);
      difficulties.push(d);
    }
  });
  difficulties.sort((x, y) => x.difficultyRating - y.difficultyRating);

  const playCount = (a.meta?.playCount || 0) + (b.meta?.playCount || 0);

  return {
    beatmapset: {
      ...primary.beatmapset,
      difficulties,
      starRange: difficulties.length > 0
        ? { min: difficulties[0].difficultyRating, max: difficulties[difficulties.length - 1].difficultyRating }
        : primary.beatmapset.starRange,
    },
    meta: {
      ...primary.meta,
      ...(playCount > 0 ? { playCount } : {}),
    },
  };
}

/**
 * The one adapter from a collection entry to the song shape (F-32). osu! collections are
 * already beatmapsets, so the song arrives pre-matched, and its artist is the mapped set's
 * own metadata, which is why `'osu-player'` counts as a structured source.
 */
export function beatmapToSong(item, section) {
  const set = item.beatmapset;
  return makeSong({
    source: 'osu-player',
    id: `osu_${set.id}`,
    title: `${set.artist} - ${set.title}`,
    channelTitle: `mapped by ${set.creator}`,
    cleanQuery: set.title,
    extractedTitle: set.title || '',
    extractedArtist: set.artist || '',
    thumbnail: set.covers?.list || null,
    hasSearched: true,
    matchedBeatmap: set,
    allMatches: [set],
    playerMeta: item.meta,
    playerSection: section,
  });
}

/**
 * The rows a section shows for the active tabs: filter, then dedupe, in that order. The mode
 * filter reads per-difficulty modes, which a merged entry would blur together, so deduping
 * first would keep a set the player never played in that mode.
 */
export function visibleItemsFor(type, entries, mode, status) {
  const filtered = (entries || []).filter(entry => matchesCollectionFilters(entry.beatmapset, mode, status));
  return dedupeByBeatmapset(filtered).map(entry => beatmapToSong(entry, type));
}
