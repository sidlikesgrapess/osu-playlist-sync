# 02 Select exact matches button

Todo: "select all confirmed matches (come up with a good name) button instead of Select all
since the tickmark of the top row does the same thing."

## Scope

Current state: NOT done. The toolbar button (src/components/SongTable.js:101-121, label
'Select All Matched') runs the same logic as the desktop header checkbox
#select-all-header-checkbox (SongTable.js:186-196). Both call handleSelectAll
(src/app/page.js:912-915), which selects every song with any matchedBeatmap, including
flagged matches (artistOverride set at src/lib/osu.js:825, titleOnly at src/lib/osu.js:800).
Every other auto select site in the app goes through isAutoSelectable
(src/lib/beatmapFormat.js:52-54; page.js:613, 780, 878). On phones the header checkbox is
hidden (it lives inside `.osu-table-desktop`, SongTable.js:169, display none at
src/app/globals.css:250-251), so the toolbar button is the only bulk select and the only
bulk deselect there.

Decisions:
- Label: 'Select Confirmed (N)', N = songs whose matchedBeatmap passes isAutoSelectable.
  'Confirmed' is the opposite of the flagged notices (overrideNoticeFor). No dash.
- The rule is one pure helper, `confirmedMatchIds(songs)` in src/lib/beatmapFormat.js, built
  on isAutoSelectable. page.js uses it; no inline flag checks.
- Click REPLACES the selection with the confirmed set (a preset, not an add), so after the
  header checkbox ticked flagged rows too, one click leaves only the confirmed ones.
- When the selection already equals the confirmed set (non empty), the button reads
  'Deselect All' and clears. It also reads 'Deselect All' when there are zero confirmed
  matches but something is ticked, so phones never lose their only bulk deselect. With zero
  confirmed and nothing ticked it is disabled.
- Header checkbox keeps 'select every matched song' behaviour and its id (smoke.mjs and
  capture.js wait on it).
- PlayerSections.js unchanged: player items never carry artistOverride/titleOnly (only set in
  src/lib/osu.js:792-825), so isAutoSelectable is true for all of them and the rule would
  change nothing; it also has no header checkbox to duplicate.
- Matching code untouched, so no bench run.

Acceptance:
1. Toolbar button reads 'Select Confirmed (N)', no dash.
2. Click sets selection to exactly the confirmed ids; flagged and unmatched songs unselected.
3. Rule lives in confirmedMatchIds; page.js uses it.
4. Selection equal to the confirmed set (non empty): button reads 'Deselect All' and clears.
5. Zero confirmed and nothing selected: button disabled.
6. Header checkbox behaviour and id unchanged.
7. Works at 1280x800 and 375x812.
8. PlayerSections unchanged.
9. npm test: baseline 164 pass / 0 fail / 1 todo still hold, plus new tests.
10. Matching code untouched.

## Implementation

Round 1. Not committed.

- src/lib/beatmapFormat.js:55-63: new pure helper `confirmedMatchIds(songs)`, the song ids
  whose matchedBeatmap passes `isAutoSelectable`, in song order. Null safe on the list and on
  each song. The one place the rule lives.
- src/app/page.js:20 imports it; src/app/page.js:917-921 adds `handleSelectConfirmed`, which
  replaces the selection with `confirmedMatchIds(songs)` (a preset, not an add, so flagged
  rows ticked by the header checkbox drop out). Passed as `onSelectConfirmed` at
  src/app/page.js:1377. `handleSelectAll` (page.js:912-915) is unchanged and still feeds the
  header checkbox.
- src/components/SongTable.js:26 new prop `onSelectConfirmed`. SongTable.js:55-64 computes
  `confirmedIds`, `confirmedSelected` (selection equals the confirmed set, non empty),
  `showDeselect` (that, or zero confirmed while something is ticked, so a phone never loses
  its only bulk deselect) and `selectConfirmedDisabled` (zero confirmed, nothing ticked).
  SongTable.js:113-137: the toolbar button now has id `select-confirmed-button`, is disabled
  and dimmed when `selectConfirmedDisabled`, calls `onDeselectAll` or `onSelectConfirmed`,
  and reads `Deselect All` or `Select Confirmed (N)`. Tooltip copy: 'Clear the selection' /
  'Select only matches that need no second look' (no dashes). The toolbar sits outside the
  desktop only wrapper, so this one change covers both widths; SongRow.js and
  SongCardMobile.js need no change (not a row change).
- Header checkbox #select-all-header-checkbox (SongTable.js:197-208) untouched: still selects
  every matched song. PlayerSections.js untouched (player items never carry the flags).
- test/beatmapFormat.test.mjs: `confirmedMatchIds` added to the import list; three tests
  (mixed list returns only plain ids in order; empty or missing list; all flagged).
- Matching code untouched, so no bench run.

Verification so far:
- npm test: 173 tests, 172 pass, 0 fail, 1 todo. Baseline 165/164/0/1 plus 5 from item 01
  (170/169/0/1) plus these 3.
- Playwright, todo-run/shots/02/check.cjs against :3000 with /api/playlist and
  /api/osu/search stubbed (4 songs: plain, artistOverride, titleOnly, no match; zero osu!
  API calls, covers aborted). ALL PASS. Desktop 1280x800: old label absent; after load the
  auto select already equals the confirmed set and the button reads Deselect All; clear
  gives 0 of 3 and 'Select Confirmed (1)'; header checkbox gives 3 of 3; the button then
  gives 1 of 3 with only checkbox-song-yt0 ticked and reads Deselect All; clicking gives
  0 of 3. Phone 375x812: button visible, Select Confirmed gives 1 of 3, Deselect All gives
  0 of 3. No horizontal scroll at either width, no dash in the label, no console errors or
  page errors. Screenshots: desktop_1_empty, desktop_2_header_all, desktop_3_confirmed,
  phone_1_empty, phone_3_confirmed (.png) in todo-run/shots/02/.

## Verification

Round 1: all three lenses passed, no must fix findings.

- **Regression** (pass): npm test 173 tests, 172 pass, 0 fail, 1 todo (baseline 165/164/0/1; growth is item 01's 5 tests plus 3 confirmedMatchIds tests at test/beatmapFormat.test.mjs:89-112). No matching file touched, so no bench run. Single SongTable call site (page.js:1377) passes onSelectConfirmed; header checkbox and handleSelectAll unchanged (SongTable.js:210). Re-ran shots/02/check.cjs at 1280x800 and 375x812: ALL PASS.
- **Acceptance** (pass): wrote and ran shots/02/verify_acceptance.cjs (stubbed APIs, both widths, mixed and all flagged scenarios). Label "Select Confirmed (N)" (SongTable.js:137), preset replaces selection with confirmedMatchIds (page.js:917-921), toggles to Deselect All, disabled at zero confirmed with nothing ticked, header checkbox still selects flagged rows, no horizontal scroll, mobile card ticks correct. PlayerSections.js, matching code and bench/ unchanged.
- **Rules** (pass): no dash in new copy, rule lives in one helper built on isAutoSelectable (beatmapFormat.js:61-63), no debug logging, comment density matches surroundings. Disclosed deviation: zero confirmed with rows ticked shows an enabled Deselect All rather than disabled (SongTable.js:63-64), accepted since it keeps bulk deselect on phones.

### Follow ups (not must fix)

- After a search, auto select already ticks the confirmed set, so the first label seen is Deselect All (SongTable.js:60-63).
- Disabled button still gets the .osu-btn-interactive hover lift (globals.css:70-72 has no :disabled guard); cosmetic.
- Speculative: confirmedSelected compares sizes (SongTable.js:60-62); a stale id in selectedIds would stop the flip to Deselect All. Harmless.
- Speculative: on phone, clearing a hand edited selection takes two taps (Select Confirmed, then Deselect All).
