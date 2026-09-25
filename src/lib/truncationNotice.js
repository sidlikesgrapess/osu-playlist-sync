/**
 * The popup text for a playlist that came back `truncated` (REBUILD_PLAN.md F-18). The
 * number osu!Sync loads is never written here: it is the `loadCap` the extractor ran under
 * (youtube.js PLAYLIST_LOAD_CAP), so the copy follows the cap wherever it is set.
 *
 * A walk that stopped before the cap (YouTube failed a continuation page, or the walk ran
 * out of time) says how many it could load, rather than claiming the cap. No dash in any
 * string.
 */
export function truncationMessage({ playlistLength, loadedCount, loadCap }) {
  const cap = loadCap ?? loadedCount;
  const loaded = Math.min(loadedCount ?? cap, cap);
  const length = playlistLength && playlistLength > loaded ? `${playlistLength} songs` : `more than ${loaded} songs`;
  if (loaded < cap) {
    return `This playlist has ${length}. osu!Sync could only load the first ${loaded} this time.`;
  }
  return `This playlist has ${length}. osu!Sync loads the first ${cap}.`;
}
