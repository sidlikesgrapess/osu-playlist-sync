# Item 11: Player search loading cost

> "are we loading every image and beatmap for the player search at once? is it expensive? if yes then we could have dynamic scroll based loading... if loading everything at once consuming less api calls, then so be it. (Don change this one without confirmation from user)"

## Scope

Branch todo-fixes at 734b912. Not matching related, so no bench run.

### Answer to the todo question

No, not everything loads at once, and it is not expensive.

- A name search is 1 call: `/api/osu/player?q=&page=` (src/app/page.js:266).
- Picking a player is 1 profile call, `/api/osu/player?userId=` (page.js:337), then the
  `best` section auto loads (page.js:322).
- Each section (best, most played, favourites) is fetched once, when first opened
  (page.js:440; mode refetch on `best` only, page.js:474), through
  `/api/osu/player/beatmaps` (page.js:385). The route caps `limit` at 100
  (src/app/api/osu/player/beatmaps/route.js:23) and makes one upstream call with
  limit=100 offset=0 (src/lib/osu.js:198-209).
- So a full player look is 1 search + 1 profile + at most 3 section calls. 100 items per section call.
- Rows are revealed 25 at a time from the list already in memory: INITIAL_REVEAL_COUNT=25,
  REVEAL_STEP=25 (src/components/PlayerSections.js:28-29, slice and Show more at
  PlayerSections.js:318-320, 501, 516). Show more makes no API call.
- Beatmap covers are already `loading="lazy" decoding="async"` (src/components/BeatmapCover.js:85-86)
  and only exist for the revealed rows. Covers are about 10 to 15 KB each (measured by the
  prior scope pass, not re-measured here).
- Scroll based data loading would split the one 100 item call into several paged calls, i.e.
  more API calls, which the todo itself rules out ("if loading everything at once consuming
  less api calls, then so be it").
- Gap found: the player search result avatars (src/components/PlayerResults.js:58-68) and the
  "Back to {username}" chip avatar (PlayerResults.js:186-190) had no `loading`/`decoding`.

### Decisions

- USER: "Avatars lazy only". Keep data loading exactly as is: no API call changes, no scroll
  based data loading, no IntersectionObserver (item 12 removes the 400px scroll box). Only add
  `loading="lazy" decoding="async"` to the two avatar imgs in PlayerResults.js.

### Acceptance

1. PlayerResults.js result avatar img has `loading="lazy"` and `decoding="async"`.
2. PlayerResults.js "Back to" chip avatar img has the same.
3. No other code changes: git diff touches only PlayerResults.js plus this notes file.
4. Request count for "search name, pick player, open one extra section, click Show more" is
   1 search + 1 userId + 2 beatmaps (best + opened section); Show more adds 0.
5. Desktop 1280x800 and phone 375x812: every results avatar and the chip avatar carry
   lazy/async and still render (naturalWidth > 0 once in view).
6. This file answers the todo with numbers. No copy changes.
7. `npm test` matches baseline: 165 tests, 164 pass, 0 fail, 1 todo.

## Implementation

- src/components/PlayerResults.js:61-62: the player search result avatar img gets
  `loading="lazy" decoding="async"`, the same pair BeatmapCover.js:85-86 uses. A 20 row
  results list no longer fetches every avatar up front; off screen ones wait until scrolled near.
- src/components/PlayerResults.js:191-192: the same pair on the "Back to {username}" chip avatar.
- Nothing else in src/ changed: page.js fetches, the beatmaps route limit=100, osu.js and the
  25/25 reveal constants are untouched (`git diff --stat` shows only PlayerResults.js, 4 lines).
  No copy changed. No pure logic was added, so there is no new unit test.

### Checks

- `npm test`: 237 tests, 237 pass, 0 fail, 0 todo. The count is above the 165 baseline because
  items 01 to 10 added tests; nothing fails.
- todo-run/shots/11/verify.cjs (Playwright, every osu! call and image stubbed, so 0 live API
  calls), desktop 1280x800 and phone 375x812, ALL PASS (todo-run/shots/11/verify-results.json):
  - all 20 result avatars have loading=lazy decoding=async, and naturalWidth > 0 after scrolling
    the last one into view;
  - request counts for "search name, pick player, open Most Played, Show more, Change Player":
    q=1, userId=1, beatmaps=2, other /api/osu = 0. Show more and Change Player add 0;
  - the Back to chip avatar has loading=lazy decoding=async and naturalWidth > 0;
  - no console errors, no requests leaked off localhost.
- Screenshots: todo-run/shots/11/{desktop,phone}_1_results.png, {desktop,phone}_2_back_chip.png.

## Verification

Round 1, all three lenses passed. No must-fix findings.

- Regression: git diff (src diff is 4 attribute lines in PlayerResults.js:61-62, 191-192), npm test 237/237 pass, re-ran stubbed verify.cjs at 1280x800 and 375x812: ALL PASS, calls q=1 userId=1 beatmaps=2 other=0. Bench not needed (no matching file changed).
- Acceptance: live run verify-live.cjs (one flow, "mrekk"): all 11 checks pass, lazy/async on all result avatars and the Back to chip at both viewports, 4 API calls total, Show more / Change Player / resize / scroll add 0.
- Rules: no copy change, no special-case list, no new fetch, bench/ untouched, test count is a superset with 0 failures.

Follow-ups (not must-fix):
- PRE-EXISTING: guest avatars (osu.ppy.sh/images/layout/avatar-guest@2x.png) are blocked by the CSP img-src in next.config.mjs:8-16, so those result tiles show broken alt text. Fix is adding https://osu.ppy.sh to img-src; separate item.
- Speculative: on phone the Back to chip can sit under the sticky top bar after scrollIntoView (likely from item 09).
- Stubbed check used a 2x2 PNG for avatars; the live run covers real avatars.
