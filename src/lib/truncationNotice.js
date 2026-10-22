/** Explain a partial playlist when YouTube gave no usable continuation cursor. */
export function truncationMessage({ playlistLength, loadedCount }) {
  const loaded = loadedCount ?? 0;
  const length = playlistLength && playlistLength > loaded ? `${playlistLength} songs` : `more than ${loaded} songs`;
  return `This playlist has ${length}. osu!Sync could only load the first ${loaded} this time.`;
}
