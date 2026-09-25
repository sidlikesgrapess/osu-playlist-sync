/**
 * The one builder of an `/api/osu/search` query string (F-05, X-08). The batch search and
 * the manual search used to assemble their own, and the manual one sent a bare `q` with no
 * source, so the route could not tell a typed query from a song whose artist was lost.
 *
 * A typed query (`manualQuery`, from the overrides or remembered on the song) is sent as
 * what it is: `q` with `source: 'query'` and no artist. The route derives the artist and
 * title from it with the cleaner, and resolveArtistTrust decides how far to trust that.
 * Everything else sends the song's own extracted fields, fallbacks included.
 *
 * Client safe: no server imports, so the page bundle does not grow by the cleaner.
 */
export function buildSearchRequest(song, overrides = {}) {
  const { mode = 'all', status = 'any', strictness = null } = overrides;
  const manualQuery = overrides.manualQuery ?? song.manualQuery ?? null;
  const params = new URLSearchParams();

  if (manualQuery) {
    params.set('q', manualQuery);
    params.set('source', 'query');
  } else {
    params.set('q', song.cleanQuery || song.title || '');
    params.set('title', song.extractedTitle || song.title || '');
    params.set('artist', song.extractedArtist || song.channelTitle || '');
    params.set('source', song.source || '');
    if (song.artistFromTitle) params.set('artistFromTitle', '1');
    const extra = [...(song.fallbacks || []), ...(song.queries || [])];
    if (extra.length > 0) params.set('fallbacks', JSON.stringify(Array.from(new Set(extra))));
  }

  params.set('mode', mode);
  params.set('status', status);
  if (strictness !== null && strictness !== undefined) params.set('strictness', String(strictness));
  return params;
}
