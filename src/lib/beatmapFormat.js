/**
 * Shared presentation helpers for beatmapsets — star colours, compact counts
 * and status badge colours are rendered identically everywhere a mapset shows up.
 */

/** osu!-style difficulty colour for a star rating. */
export function getStarColor(stars) {
  if (!stars) return '#c6b8ce';
  if (stars < 2.5) return '#4fc3f7';
  if (stars < 4.0) return '#81c784';
  if (stars < 5.3) return '#ffb74d';
  if (stars < 6.5) return '#ff8a80';
  return '#ba68c8';
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
