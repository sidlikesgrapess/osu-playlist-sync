# 12 Full-length player sections, sticky headers

## Decisions

- USER: Sticky stack. Each section (Best, Most played, Favourites) shows all its rows at full
  length, with no 400px inner scroll box. Its header docks under the navbar and search bar
  while you scroll it, and the next section's header pushes it out, like VS Code sticky
  scroll. The motion matches the search bar's easing.
- USER: every section header also has a collapse button. Collapsing hides that section's rows
  and keeps its header, and the button works from the docked header too. The animation is
  smooth.
- USER (refined): collapsing a docked section scrolls so its header stays in view, not leaving
  the user stranded far below. The animation respects prefers-reduced-motion. No dashes as
  punctuation in copy. Check desktop 1280x800 and phone 375x812.

## Scope

Current state before this item (line numbers from main at f7e1a5e):
- src/components/PlayerSections.js:23-24 `LIST_MAX_HEIGHT = 400` and 456-470 the row list is
  an inner scroll box (`maxHeight: 400px`, `overflowY: auto`, scrollbar margin hack).
- src/components/PlayerSections.js:329-337 the card is `.osu-glass` with `overflow: hidden`,
  which makes it a scroll container, so a sticky header inside it could never stick.
- src/components/PlayerSections.js:340-389 the whole header is one `<button>`, no sticky, no
  aria-expanded, no separate collapse control. 392 `{section.isOpen && ...}` unmounts the
  body, so open and close jump.
- src/components/PlayerSections.js:28-29, 496-517 INITIAL_REVEAL_COUNT / REVEAL_STEP 25 and
  Show more reveal from memory. These stay.
- src/app/page.js:430-442 `handleToggleSection` is the lazy open. It stays untouched.
- src/components/PlaylistInput.js:89-108 search bar docks at scrollY > 180; 176-193 it is
  sticky at top 56px, z 45, easing cubic-bezier(0.16, 1, 0.3, 1), and its height changes when
  it docks. Nothing publishes that height.
- src/components/Navbar.js:60-63 navbar sticky top 0, z 60.
- No prefers-reduced-motion handling anywhere in src.
- Rows here are PlayerSections' own BeatmapRow (one component for desktop and phone), so the
  SongRow / SongCardMobile rule does not apply.

Acceptance:
1. No row list inside PlayerSections has a max-height or its own vertical scroll; every
   revealed row is in page flow; body scrollHeight equals clientHeight. LIST_MAX_HEIGHT gone.
2. INITIAL_REVEAL_COUNT and REVEAL_STEP stay 25; Show more reveals 25 with no request.
3. An open section's header docks while scrolling through it; its rect.top equals the docked
   search bar's bottom within 1px at 1280x800 and 375x812.
4. The dock offset is measured: a ResizeObserver on the search bar publishes
   `--player-dock-top` (sticky top + live height), and headers use it for `top`.
5. The next open section pushes the previous header up and out (VS Code sticky scroll). Headers
   never overlap as stacked opaque layers and stay below the search bar (z < 45) and navbar.
6. The card no longer uses overflow hidden in a way that breaks sticky; corners still rounded.
7. Each header has an explicit collapse / expand control with aria-expanded and an aria-label
   ("Collapse Most Played" / "Expand Most Played"), working from the docked header.
8. Collapsing hides the rows, keeps the header; if the header was docked, the page scrolls so
   the header sits at the dock offset.
9. Open and collapse animate the body height with cubic-bezier(0.16, 1, 0.3, 1), about 0.3s.
   Under prefers-reduced-motion: reduce the transitions are none and the scroll uses 'auto'.
10. Lazy open unchanged: first open fires exactly one /api/osu/player/beatmaps; collapse,
    reopen, scroll, dock and resize fire no /api/osu calls.
11. No horizontal overflow at 375px; the docked header stays on one line.
12. No new user-facing copy uses a dash as punctuation.
13. npm test: 165 or more tests, 0 fail, at least one new test for the pure collapse scroll
    helper, the one todo unchanged.

## Implementation

Status: implemented, not committed. Path note: the task named
`todo-run/todo-run/items/12-sticky-sections.md`. This file (`todo-run/items/`) is the one
STATE.md row 12 links to, so the scope and these notes live here.

- `src/lib/stickySections.js` (new, 1-57): the pure geometry. `DOCK_TOP_VAR` (10),
  `dockTopFrom` (19), `parseDockTop` (26), `isHeaderDocked` (36), `collapseScrollTarget` (53).
- `src/components/PlaylistInput.js`: `dockRef` (91). A ResizeObserver plus a resize listener
  publishes `--player-dock-top` = computed sticky top + offsetHeight on `<html>` (118-123) and
  removes it on unmount (132). `ref={dockRef}` is on the sticky bar wrapper (201).
- `src/components/PlayerSections.js`:
  - `DOCK_EASE` = the search bar's `cubic-bezier(0.16, 1, 0.3, 1)` and `BODY_MS` 300 (27-31).
    `usePrefersReducedMotion` (39) and `readDockTop` (52).
  - `SectionBody` (61): a grid that animates `grid-template-rows` 0fr to 1fr (104). It stays
    mounted while closing and unmounts on transitionend or after a fallback timeout, so lazy
    open still holds. The rows render nothing until the section opens.
  - The 400px `LIST_MAX_HEIGHT` inner scroll box and the card's `overflow: hidden` are gone.
    The row list is a plain column (598), so every revealed row shows at full length.
  - Header (486-506): `position: sticky` inside its own card at
    `top: var(--player-dock-top, 56px)`, z 30 (under navbar 60 and search bar 45). The card
    is the sticky containing block, so the next card's header pushes the previous one out for
    free. `data-docked` comes from a rAF-throttled scroll/resize check (405-417), and it
    switches to square corners and a shadow.
  - Two buttons, both with `aria-expanded` and `aria-controls` (511, 564): the whole header, and
    a 30x30 collapse button with `aria-label`/`title` "Collapse X" / "Expand X" (468, 563-568).
    The chevron rotates with DOCK_EASE (590).
  - `handleToggle` (433-445): when a docked section collapses, it jumps (behavior `auto`) to
    `collapseScrollTarget` before toggling, so the header lands on the pixel it already
    occupied. **Deviation from the scope:** the scope suggested a smooth scroll. A smooth scroll
    running alongside the shrinking body pushes the header off screen mid animation, so the
    jump is deliberate (documented at stickySections.js 40-52).
  - `INITIAL_REVEAL_COUNT` / `REVEAL_STEP` are still 25 (116-117). page.js is untouched, and no
    fetch was added.
- `src/app/globals.css` 271-278: `.ps-anim { transition: none !important }` under
  `prefers-reduced-motion: reduce`, as a first paint backstop.
- `test/stickySections.test.mjs` (new): 5 tests.

New copy is only "Collapse <label>" / "Expand <label>", with no dashes.

### Checks

- `npm test`: 242 tests, 242 pass, 0 fail, 0 todo (5 new). The baseline in criterion 13 (165,
  1 todo) is out of date. Earlier items added tests and resolved the todo (commit 39fb490,
  item 07), not this one.
- Playwright `todo-run/shots/12/verify.cjs`, live, 1280x800 and 375x812:
  **ALL PASS (25)**. Results are in `verify-results.json`, with screenshots `desktop_*.png` and
  `phone_*.png`. Covered: no 400px or scrolling inner box; Best shows 25 rows at full length;
  a docked header's top equals the search bar's bottom and `--player-dock-top` within 1px; it
  stays on one line; Best's header is pushed out at the Most Played boundary; collapsing from a
  docked Most Played header leaves it in view with aria-expanded false and label
  "Expand Most Played"; reopening makes no call; Show more takes 25 to 50 with no call; reduced
  motion gives a 0s transition; no horizontal scroll at 375. Total osu! calls: q=1, userId=1,
  beatmaps=2 (best, most_played).
- Console: the only errors are CSP blocks of `osu.ppy.sh/images/layout/avatar-guest@2x.png` in
  the player search results (img-src allows a.ppy.sh only). They predate this item and are
  unrelated to it.

## Verify round 1

Two lenses (regression, acceptance) found the same must-fix defect.

- **Claim:** every collapsed or never-opened section header is drawn about `--player-dock-top`
  pixels below its own card (about 205px on desktop, 335px on phone). The header uses
  `position: isOpen ? 'sticky' : 'relative'` but always sets `top: var(--player-dock-top, 56px)`,
  and on a relatively positioned element `top` offsets it. Closed cards show as empty 46px
  boxes while their label, badge and chevron (and their click targets) float over the next
  card or the footer. That covers the initial state too, since Most Played and Favourites
  start closed.
- **Evidence:** src/components/PlayerSections.js:490-491. verify-results.json
  desktop_collapsed_in_view: cardTop 490.09, hTop 696.09. phone_collapsed_in_view: cardTop
  376.3, hTop 712.3. Screenshots desktop_4_collapsed.png, va_desktop_collapsed.png,
  va_phone_collapsed.png, vm_desktop_best_with_content_below_js.png;
  verify-collapse-mock-results-js.json (after scrollTo the card lands at 205 but the header
  sits at 411.09 = 206 + 205). The old verify check passed only because it tested
  hTop < viewport height, never hTop against cardTop.

## Fix round 1

- **Verdict: confirmed.** I checked it myself. On a `position: relative` element, `top` offsets
  the box, and the header set `top: var(--player-dock-top)` whatever its position was.
- **Fix, src/components/PlayerSections.js:490-493 (position at 492, top at 493):** the dock offset now applies only while the
  header is sticky, `position: isOpen ? 'sticky' : 'static'` and
  `top: isOpen ? var(--player-dock-top, 56px) : 'auto'`. That covers every closed header, the
  initial closed state and the closing transition. No section name is special cased. None of
  the header's children are absolutely positioned, so dropping `relative` changes nothing else.
- **Verify script tightened (todo-run/shots/12/verify.cjs):** the old `collapsed_in_view`
  only checked `hTop < viewport height`, which is how the bug passed. New checks:
  - `*_closed_headers_in_card_initial` and `*_closed_headers_in_card_after_collapse`: every
    closed header's top is within 2px of its card top, and its bottom is inside the card.
  - `*_collapsed_in_view`: the collapsed header's top equals the dock line (the search bar's
    bottom) within 2px. The one exception is when the page is already scrolled to its end
    (`scrollY >= scrollHeight - innerHeight - 1`), and then the header must lie fully between
    the dock line and the viewport bottom.
- **Result:** ALL PASS (29). Closed headers sit 1px (the card border) below their card top,
  for example most_played cardTop 2443.09 / hTop 2444.09 initially. After collapsing Most Played,
  desktop hTop is 554.09 in card 553.09 to 601.09, and phone hTop is 571.31 in card 570.31 to
  616.31. osu! calls are unchanged: q=1, userId=1, beatmaps=2. Screenshots desktop_4_collapsed.png
  and phone_4_collapsed.png show both closed cards with their headers inside them, above the
  footer.
- **Why the collapsed header lands at 554, not at the dock (205):** in this live flow, Most
  Played is followed only by a closed Favourites card and the footer. Once the body collapses,
  the document is too short for the card to reach the dock, so the browser clamps the scroll at
  the end (desktop scrollY 1815 = maxScroll 1815, phone 3198 = 3198, from verify-results.json).
  That is the most the page can scroll, and the header is in full view. When there is content
  below, the target math lands exactly on the dock. verify-collapse-mock-results-js.json already
  showed the card top at 205 after scrollTo, and the header was off only because of this bug.
- `npm test`: 242 tests, 242 pass, 0 fail, 0 todo (unchanged from implement). The bench was not
  run because matching is untouched.
- Not committed.

## Verification

### Round 1 (failed)

- **Regression**: ran `npm test` (242/242 pass), reviewed the src diff, callers in page.js,
  z-index use and the verify script output. Must fix: a closed section header was drawn about
  `--player-dock-top` px below its own card (205px desktop, 335px phone). The cause was
  `position: relative` with an unconditional `top` (PlayerSections.js:490-491). Non must fix
  findings: the collapse scroll is always `behavior: 'auto'`, which is deliberate (stickySections.js:40-52).
  No other regressions, and the lazy load cost q=1, userId=1, beatmaps=2.
- **Acceptance**: a live run ('mrekk') at 1280x800, 900x800 and 375x812, plus a mocked
  collapse diagnosis. Found the same must fix offset bug, visible in va_desktop_collapsed.png,
  va_phone_collapsed.png and vm_desktop_best_with_content_below_js.png. Every other point
  passed: no inner scroll, full length rows, dock var tracking, push out, z-index, aria,
  show more with 0 calls, reduced motion, no horizontal scroll.
- **Rules**: passed. The copy has no dashes, bench/ is untouched, there are no special case
  lists and no console logging. The `ps-header` / `ps-collapse-btn` classes are test hooks only.
  The docked look and the two buttons are minor extra scope.
- **Resolution**: a closed header now uses `position: static` with `top: auto`
  (PlayerSections.js:490-493).

### Round 2 (passed)

- **Regression**: 242/242 pass. The diff is limited to globals.css, PlayerSections.js,
  PlaylistInput.js and the new stickySections.js. Nothing references LIST_MAX_HEIGHT, and
  closed headers sit 1px under their card top.
- **Acceptance**: an independent verifier (verify-r2-acceptance.cjs, 46 checks, live
  q=1/userId=1/beatmaps=2) and a mocked per frame animation script (verify-r2-mock-anim.cjs).
  A1 through A12 all hold. The docked header is within 0.5px of the bar bottom during the dock
  animation, it is pushed out with no overlap, collapse and reopen animate over about 13 frames,
  and reduced motion is instant.

### Follow ups (not must fix)

- The collapse scroll jumps (`behavior: 'auto'`) even without reduced motion; the user should confirm this.
- A collapsed header lands 1px below the dock line because the target is the card top, which includes the border (stickySections.js:56).
- Speculative: a collapse jump that lands at scrollY <= 180 undocks the search bar, so the dock offset moves.
- Speculative: both header buttons play the hover sound, so it plays twice when the cursor moves from the label to the chevron.
- The first open of an unloaded section animates only the loading state, and the rows then appear at once.
- todo-run/baseline/tests.txt (165 tests, 1 todo) is out of date; the current suite has 242 tests and 0 todo.
