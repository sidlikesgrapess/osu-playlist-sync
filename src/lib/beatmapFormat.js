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

/**
 * The line shown where a beatmap would be, when the matcher returned nothing.
 *
 * "No beatmaps found" and "this song is on osu!, but by someone else" are different
 * outcomes, and collapsing them into one message is what makes a deliberate refusal look
 * like a failure. The artist gate only feels correct if it can say why it refused.
 */
export function describeRejection(rejection) {
  if (!rejection) return 'No matching beatmapset found';

  switch (rejection.kind) {
    case 'wrong-artist':
      // Short on purpose: the beatmap itself is shown right alongside, badged with the
      // artist mismatch, so naming the other artist here would only repeat it.
      return rejection.artist
        ? `Found this song but it's not by ${rejection.artist}`
        : 'Found this song but by a different artist';
    case 'artist-absent':
      return rejection.artist
        ? `${rejection.artist} has no beatmaps on osu!`
        : 'This artist has no beatmaps on osu!';
    case 'artist-unknown':
      return 'No matching beatmapset found — the artist could not be verified';
    default:
      return 'No matching beatmapset found';
  }
}
