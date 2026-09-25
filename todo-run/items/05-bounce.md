# 05 Hover bounce, toggleable

Todo: "maybe a little bounce on every hover animation? toggleable"

## Scope

Current state (before this item):
- Nothing in src/ mentions bounce, an osu-bounce class or prefers-reduced-motion.
- Toggle pattern to copy: src/components/Navbar.js. `soundOn` state (:15), mount effect reads
  localStorage `osu_sfx_enabled`, missing key means off (:19-31), `toggleSound` writes it back
  (:38-46), SFX button (:126-148) in the right action group (:124) before Online (:151).
- src/app/layout.js:11-19 renders `<html>` with no className, no `<head>`, no script and no
  suppressHydrationWarning.
- Hover animations, all in src/app/globals.css with plain `ease`:
  .osu-btn-interactive (transition :65 !important, hover lift :70-72, active :74-76),
  .osu-pill-tab (:97 !important, lift :102-104), .osu-table-row background only (:111-122),
  row .osu-thumb-container scale(1.04) (:125-131), row .osu-play-btn scale(1.1) (:141-147),
  .osu-thumb-container img scale(1.06) (:155-161).
- Those classes are shared by SongRow.js and SongCardMobile.js, so one CSS rule set keyed off
  html.osu-bounce covers desktop and mobile rows without touching either component.

Decisions:
- USER DECIDED: bounce is OFF by default (opt in via the toggle). Always off under
  prefers-reduced-motion.
- Only easing and duration change; lift distances and scales stay the same. The row itself
  does not move (it uses content-visibility; a moving row would jitter).
- Rules also gated on `(hover: hover)` so touch devices get no sticky bounce after a tap.

Acceptance:
1. Key `osu_bounce_enabled` missing or 'false': no osu-bounce class on `<html>`, timing on
   .osu-btn-interactive stays `ease`.
2. New Navbar button next to SFX (pink on, grey off, osu-btn-interactive, hover and click sfx)
   toggles the class on document.documentElement at once and writes 'true' / 'false'.
3. Default OFF; a missing key means off.
4. Key 'true': html.osu-bounce is present before first paint via an inline script in
   layout.js wrapped in try/catch; no class flip after domcontentloaded.
5. No hydration mismatch warning (html has suppressHydrationWarning).
6. One rule set in globals.css keyed off html.osu-bounce giving the existing hover transforms
   an overshoot easing, !important where the base is !important; :active stays snappy.
7. Inside `@media (prefers-reduced-motion: no-preference) and (hover: hover)`.
8. Subtle: same lift and scale values, no layout shift.
9. Label and title use no dash as punctuation.
10. At 375px the Navbar fits on one row; Report Issue is not pushed off screen.
11. `npm test` stays at baseline 165 / 164 pass / 0 fail / 1 todo plus new passing tests.

## Implementation

- **src/lib/bouncePref.js (new).** `BOUNCE_STORAGE_KEY = 'osu_bounce_enabled'` and
  `BOUNCE_CLASS = 'osu-bounce'` (:10-11). `isBounceEnabled(storage)` is true only for a stored
  'true'; missing, other values or a throwing storage mean off (:18-24). `saveBounceEnabled(on, storage)`
  (:27-31) and `applyBounceClass(root, on)` (:34-36). The storage is resolved inside the try
  (:15) because reading `window.localStorage` itself throws when site data is blocked.
  `BOUNCE_BOOT_SCRIPT` (:40-42) is the inline head script, built from the same constants so the
  key cannot drift between the toggle and the boot path.
- **src/app/layout.js.** `<html suppressHydrationWarning>` (:16) and a `<head>` with the inline
  boot script (:17-19), so a reload with the key 'true' has the class before first paint and
  React does not warn that the class list differs from the server markup.
- **src/components/Navbar.js.** `bounceOn` state (:18), read on mount with the SFX preference
  (:34), `toggleBounce` flips state, the root class and storage together and plays the click
  sfx (:52-58). The button (:162-186) copies the SFX button exactly (pink on, grey off,
  osu-btn-interactive, hover sfx), adds `aria-pressed`, uses the lucide MoveVertical icon and
  label "Bounce", titles "Hover bounce on" / "Hover bounce off" (no dashes). It fits at 375px
  with the label, so no compact variant was needed.
- **src/app/globals.css:163-185.** One rule set keyed off `html.osu-bounce`, inside
  `@media (prefers-reduced-motion: no-preference) and (hover: hover)`, over the shared hover
  primitives (.osu-btn-interactive, .osu-pill-tab, row .osu-thumb-container, row .osu-play-btn,
  .osu-thumb-container img). It changes only timing function (cubic-bezier(0.34, 1.56, 0.64, 1))
  and duration (0.28s), with !important and higher specificity so it beats the !important bases
  at :65 and :97. Lift and scale values are untouched, so nothing moves further and layout does
  not shift. `:active` gets a 0.08s ease (:180-184) so the press stays snappy. SongRow.js and
  SongCardMobile.js need no edits since both use these classes. The row itself was not given
  a lift (it uses content-visibility, :115-116).
- **test/bouncePref.test.mjs (new, 6 tests).** Storage parsing, save, class toggle, the boot
  script run in a `vm` context against fake storage (including a throwing one), layout.js
  wiring, and a CSS walk asserting every `osu-bounce` rule sits inside a media block with both
  `prefers-reduced-motion: no-preference` and `hover: hover`.

Results:
- `npm test`: 193 tests, 192 pass, 0 fail, 1 todo (the known F-28 todo). Items 01 to 04 had
  taken the suite past the 165 baseline; this item adds 6, all passing.
- Playwright sanity check `todo-run/shots/05/verify.cjs`: 17/17 PASS. Default off (no class,
  timing `ease`); toggle on sets class and 'true', SFX button timing becomes the cubic bezier;
  reload has the class at DOMContentLoaded (no flash) and the button shows on; row thumb gets
  the bezier; toggle off removes class, writes 'false', absent after reload; reduced motion
  with key 'true' keeps `ease`; phone 375x812 off and on: scrollWidth 375, Report Issue right
  edge 361, all buttons on one row, and touch (no hover) keeps `ease`; no hydration warnings.
  Screenshots: desktop-bounce-navbar-hover.png, desktop-bounce-hover.png, phone-navbar-off.png,
  phone-navbar-on.png. One osu! search ("YOASOBI - Idol") was made.
- No matching code touched, so no bench run.

## Verification

Round 1, all three lenses passed. No must-fix findings.

- **Regression.** Ran `npm test` (193 tests, 192 pass, 0 fail, 1 todo, against the 165/164/0/1
  baseline; the todo is F-28), reviewed the full diff, grepped component inline transitions,
  and re-ran `todo-run/shots/05/verify.cjs` (17/17). Diff touches only globals.css, layout.js,
  Navbar.js and the new bouncePref module and test; no matching code, so no bench run.
- **Acceptance.** Independent Playwright check `todo-run/shots/05/acceptance.cjs` (18/18 at
  1280x800 and 375x812) plus `touch.cjs`. AC1 to AC11 all pass: off by default, toggle writes
  class and storage, class present at DOMContentLoaded with no flips, blocked storage safe, no
  hydration warnings, one rule set keyed off `html.osu-bounce`, reduced motion and touch stay
  on `ease`, hover end states unchanged, no dashes in copy, phone navbar fits one row.
- **Rules.** No dash punctuation in copy, one general CSS rule set inside the
  reduced motion and hover media query, no bench/ changes, no debug logging, tests pass.

Follow-ups (not must-fix):
- The row play button does not visibly bounce: BeatmapCover.js:129 sets an inline
  `transition: 'background 0.15s ease'`, which overrides the stylesheet transition, so the
  scale(1.1) hover snaps. Predates this item.
- The `!important` timing also retimes the inline transition on `.osu-thumb-container img`
  (BeatmapCover.js:94-97). Intended effect; scale values unchanged.
- The bounce on the 1px button lift is barely visible (cosmetic, speculative).
- New comments in Navbar.js and globals.css are denser than the existing terse style.
