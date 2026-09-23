/**
 * Shared presentation helpers for beatmapsets — star colours, compact counts
 * and status badge colours are rendered identically everywhere a mapset shows up.
 */

/** osu!-style difficulty colour for a star rating. */
export function getStarColor(stars) {
  if (!stars) return '#c6b8ce';
  if (stars < 2.5) return '#4fc3f7';
  if (stars < 3.0) return '#81c784';
  if (stars < 4.0) return '#ffb74d';
  if (stars < 5.3) return '#ff8a80';
  if (stars < 6.5) return '#e170c3';
  if (stars < 7.9) return '#8374c7';
  return '#70408a';
}

/** 1234 -> "1.2K", 1500000 -> "1.5M". */
export function formatCompactNumber(num) {
  const val = Number(num);
  if (!val || Number.isNaN(val)) return '0';
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (val >= 1_000) return (val / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return val.toLocaleString();
}

/**
 * What the "Ranked & Loved" filter accepts.
 *
 * Lives here, client-safe, because page.js narrows an already-fetched candidate list
 * with it while osu.js filters the search pool with it. If those two ever disagreed,
 * narrowing the filter locally would keep a different set of beatmaps than refetching
 * with it would, which is the one thing the local path has to get exactly right.
 */
const RANKED_AND_LOVED = ['ranked', 'loved', 'qualified'];

/** Whether a beatmapset status passes the "Ranked & Loved" filter. */
export function isRankedStatus(status) {
  return RANKED_AND_LOVED.includes(String(status).toLowerCase());
}

/**
 * The rebuild's replacement for `RANKED_AND_LOVED` above (REBUILD_PLAN.md 1.2): the "Ranked
 * & Loved" label is meant to mean exactly this set on every path (search, collections,
 * narrowing), with no `qualified` (see the plan's U-8). It is added here, not yet wired in
 * or used to replace `RANKED_AND_LOVED`/`isRankedStatus` above -- see this workstream's
 * planProblems: the plan's own binding signature reuses the name `isRankedStatus` for a
 * function bound to this constant, which cannot coexist with the export of that name four
 * lines up in the same module, and deleting the existing one is explicitly out of scope for
 * this step.
 */
export const RANKED_LOVED_STATUSES = ['ranked', 'approved', 'loved'];

/** The upstream osu! API search `s=` parameter for a UI status filter value. */
export function upstreamStatusFor(filter) {
  return String(filter).toLowerCase() === 'ranked' ? 'leaderboard' : 'any';
}

/** Whether a beatmapset can be auto-selected, rather than requiring the user to tick it. */
export function isAutoSelectable(beatmapset) {
  return !!beatmapset && !beatmapset.artistOverride && !beatmapset.titleOnly;
}

/**
 * The notice `MatchNotice.js` renders over a flagged beatmapset, or `null` for an ordinary
 * one. `song` supplies the target artist for the `artist` case -- the artist the search was
 * for, never the beatmapset's own artist (see `describeRejection` above for why that
 * distinction matters).
 */
export function overrideNoticeFor(beatmapset, song) {
  if (!beatmapset) return null;

  if (beatmapset.artistOverride) {
    const artist = String(song?.extractedArtist || '').trim();
    return artist ? { kind: 'artist', artist } : { kind: 'closest' };
  }

  if (beatmapset.titleOnly) {
    return { kind: 'title' };
  }

  return null;
}

const STATUS_BADGE_STYLES = {
  ranked: { bg: '#44bbee', color: '#081a24' },
  loved: { bg: '#ff66aa', color: '#ffffff' },
  qualified: { bg: '#3399ff', color: '#ffffff' },
  pending: { bg: '#ffcc22', color: '#081a24' },
  wip: { bg: '#ff9944', color: '#081a24' },
};

const DEFAULT_STATUS_BADGE = { bg: '#5a5266', color: '#ffffff' };

/** Background / foreground pair for a beatmapset status badge. */
export function getStatusBadgeStyle(status = '') {
  return STATUS_BADGE_STYLES[String(status).toLowerCase()] || DEFAULT_STATUS_BADGE;
}

/** The aside every refusal the slider can undo ends with, italicised by the caller. */
const LOWER_STRICTNESS_HINT = 'try lowering the strictness';

/**
 * The line shown where a beatmap would be, when the matcher returned nothing.
 *
 * "No beatmaps found" and "this song is on osu!, but by someone else" are different
 * outcomes, and collapsing them into one message is what makes a deliberate refusal look
 * like a failure. The artist gate only feels correct if it can say why it refused.
 *
 * Returns `{ message, hint }` rather than one string because the hint is rendered in
 * italics. The alternative is finding the parenthetical again with a regex at each call
 * site, which quietly makes every future message's punctuation load-bearing.
 *
 * `hint` is null wherever the slider is not the answer: a wrong-artist refusal already
 * shows the map it found, so loosening would change nothing the user can see.
 */
export function describeRejection(rejection) {
  if (!rejection) return { message: 'No matching beatmapset found', hint: null };

  switch (rejection.kind) {
    case 'wrong-artist':
      // Short on purpose: the beatmap itself is shown right alongside, badged with the
      // artist mismatch, so naming the other artist here would only repeat it.
      return {
        message: rejection.artist
          ? `Found this song but it's not by ${rejection.artist}`
          : 'Found this song but by a different artist',
        hint: null,
      };
    case 'artist-absent':
      return {
        message: rejection.artist
          ? `${rejection.artist} has no beatmaps on osu!`
          : 'This artist has no beatmaps on osu!',
        hint: LOWER_STRICTNESS_HINT,
      };
    case 'artist-unknown':
      return {
        message: 'No matching beatmapset found. The artist does not match',
        hint: LOWER_STRICTNESS_HINT,
      };
    case 'status-filtered':
      // The match was found and then hidden, so the generic "nothing found" would be
      // untrue and would point at the wrong control.
      return {
        message: 'Found this song but no ranked or loved beatmap',
        hint: 'switch the filter to All',
      };
    default:
      return { message: 'No matching beatmapset found', hint: LOWER_STRICTNESS_HINT };
  }
}
