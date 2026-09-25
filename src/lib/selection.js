/**
 * The download bar works across both searches at once (todo item 09): the playlist and the
 * osu! player each keep their own rows and their own ticks, and Download, ZIP and the count
 * read the union of the two. Kept pure so the rules are testable without React.
 *
 * A side is `{ name, songs, selectedIds }`. Sides are read in the order given, so the first
 * side that ticked a beatmapset supplies its row (page.js passes the playlist first).
 */

const beatmapsetKey = (song) => song?.matchedBeatmap?.id ?? null;

/**
 * Every ticked, matched beatmapset across `sides`, once each, as
 * `{ song, sides: Set<name> }`. `sides` names every side that ticked that beatmapset, so a
 * caller can tell a set held by both searches from one only a single search wants.
 */
export function selectedBeatmapEntries(sides) {
  const byKey = new Map();
  for (const { name, songs, selectedIds } of sides) {
    for (const song of songs || []) {
      if (!selectedIds?.has(song.id)) continue;
      const key = beatmapsetKey(song);
      if (key === null) continue;
      const entry = byKey.get(key);
      if (entry) entry.sides.add(name);
      else byKey.set(key, { song, sides: new Set([name]) });
    }
  }
  return [...byKey.values()];
}

/** The rows a batch downloads: ticked, matched, one per beatmapset. */
export function selectedBeatmaps(sides) {
  return selectedBeatmapEntries(sides).map(entry => entry.song);
}

/** Every matched beatmapset across `lists` of songs, once each, first list first. */
export function matchedBeatmapUnion(lists) {
  const seen = new Set();
  const out = [];
  for (const songs of lists) {
    for (const song of songs || []) {
      const key = beatmapsetKey(song);
      if (key === null || seen.has(key)) continue;
      seen.add(key);
      out.push(song);
    }
  }
  return out;
}

/**
 * The names of the sides a batch would lose rows for if that side were dropped: a side
 * appears here when some entry was ticked on it alone. A set ticked on both is still wanted
 * by the side that stays, so it keeps the batch going.
 */
export function soleOwnerSides(entries) {
  const owners = new Set();
  for (const { sides } of entries) {
    if (sides.size === 1) owners.add([...sides][0]);
  }
  return owners;
}

export const DEFAULT_ZIP_TITLE = 'osu_playlist_sync';

/**
 * The ZIP stem for a batch: the player's name when every set came from the player, the
 * playlist's title when every set came from the playlist, and the neutral default for a mix.
 */
export function zipBaseTitle(entries, { playerName, playlistTitle } = {}) {
  const all = new Set(entries.flatMap(entry => [...entry.sides]));
  if (all.size === 1 && all.has('player') && playerName) return `${playerName}_osu_maps`;
  if (all.size === 1 && all.has('playlist') && playlistTitle) return playlistTitle;
  return DEFAULT_ZIP_TITLE;
}
