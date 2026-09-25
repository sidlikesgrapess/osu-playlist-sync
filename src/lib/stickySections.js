// Pure geometry for the player sections' sticky headers (todo item 12). Kept out of the
// component so node --test can cover it, the way createPreviewStore is split out of
// useAudioPreview.
//
// Every header is `position: sticky` inside its own card, at `top: var(--player-dock-top)`.
// PlaylistInput publishes that variable as its sticky top plus its live height, so a docked
// header sits right under the docked search bar whatever height the bar has at that moment.

/** The CSS variable PlaylistInput sets on <html> and the section headers stick to. */
export const DOCK_TOP_VAR = '--player-dock-top';

/** Used before PlaylistInput has measured itself: the navbar's height, where the bar sticks. */
export const DEFAULT_DOCK_TOP = 56;

// Sub pixel layout and rounding can leave a resting header a fraction off its natural spot.
const EPSILON = 0.5;

/** The value to publish: where the bar sticks plus how tall it is right now. */
export function dockTopFrom({ stickyTop, height }) {
  const top = Number.isFinite(stickyTop) ? stickyTop : DEFAULT_DOCK_TOP;
  const h = Number.isFinite(height) && height > 0 ? height : 0;
  return Math.round((top + h) * 100) / 100;
}

/** Reads the published variable back ('123.5px', '', undefined) as a number. */
export function parseDockTop(value, fallback = DEFAULT_DOCK_TOP) {
  const n = parseFloat(String(value ?? '').trim());
  return Number.isFinite(n) ? n : fallback;
}

/**
 * A header is docked when its card has scrolled above the dock line: the header is then
 * held at the dock rather than sitting at the top of its card. `cardTop` is the card's
 * getBoundingClientRect().top.
 */
export function isHeaderDocked({ cardTop, dockTop }) {
  return Number.isFinite(cardTop) && Number.isFinite(dockTop) && cardTop < dockTop - EPSILON;
}

/**
 * Where to scroll when a section is collapsed, or null to leave the scroll alone.
 *
 * Collapsing a docked section would otherwise leave the user far below it, looking at
 * whatever came after its rows. Scrolling so the card's top lands on the dock line puts the
 * collapsed header exactly where the docked one was, so it does not appear to move.
 *
 * The caller jumps there (behavior 'auto') before the body starts to shrink, rather than
 * scrolling smoothly: a smooth scroll runs alongside the collapse, the shrinking body lifts
 * the card's bottom past the dock line mid scroll, and the header is pushed off screen and
 * slides back. Since the jump lands the header on the pixel it already occupied, the only
 * visible motion is the body collapsing under it.
 */
export function collapseScrollTarget({ cardTop, scrollY, dockTop }) {
  if (!isHeaderDocked({ cardTop, dockTop })) return null;
  const y = Number.isFinite(scrollY) ? scrollY : 0;
  return Math.max(0, Math.round(y + cardTop - dockTop));
}
