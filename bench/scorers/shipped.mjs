import { scoreBeatmapMatch, resolveArtistTrust, aliasesFromSets } from '../../src/lib/osu.js';

export const name = 'SHIPPED (src)';
export const usesProbe = true;
export const probeMode = 'verify';

/**
 * Rebuild the object probeOsuArtist would have returned, from the captured sets.
 *
 * Both the alias rule and the trust decision are imported, not reimplemented. The previous
 * version kept private copies of each, so a fix to src/lib/osu.js left this row scoring
 * against the old logic while still calling itself SHIPPED -- the one thing this file is
 * supposed to make impossible.
 */
const probeFromCapture = (probe, artist) =>
  probe ? { artist, count: probe.sets.length, aliases: aliasesFromSets(artist, probe.sets) } : null;

export function resolve(ctx) {
  const structured = ctx.source === 'spotify' || ctx.source === 'apple';
  if (structured && ctx.channelTitle) {
    // Structured sources separate artist from title already, so the `Artist - Title`
    // splitter has nothing to add and plenty to break ("Re:Re:" -> artist "Re").
    return { title: ctx.rawTitle || ctx.cleanedTitle, artist: ctx.channelTitle, artistConfidence: 'high' };
  }
  return { title: ctx.cleanedTitle, artist: ctx.cleanedArtist || ctx.channelTitle || '', artistConfidence: 'low' };
}

export function score(set, title, artist, resolved = {}) {
  // Structured metadata is authoritative on arrival and never probed.
  if (resolved.artistConfidence === 'high') {
    return scoreBeatmapMatch(set, title, artist, { artistConfidence: 'high', aliases: null });
  }

  const trust = resolveArtistTrust(
    artist,
    resolved.candidates || [],
    probeFromCapture(resolved.probe, artist)
  );
  return scoreBeatmapMatch(set, title, artist, trust);
}
