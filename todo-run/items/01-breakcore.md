# 01 Breakcore playlist 11 to 7

Todo: "breakcore playlist has 11 songs but only 7 are fetched."
https://music.youtube.com/playlist?list=PLJU2iuLr5pzzwD1BjsQSX4Exb-w1Wc2Kp

## Scope

Current state: NOT done. The live Innertube browse for VLPLJU2iuLr5pzzwD1BjsQSX4Exb-w1Wc2Kp
holds 7 lockupViewModel items and no unplayable ones. YouTube removes the 4 unavailable
videos from the window entirely and mentions them only in a top level `alerts` entry
("4 unavailable videos are hidden"). The F-18 structural check (src/lib/youtube.js
readWindowItem) never sees them, so unavailableCount was 0 and the notice in
src/app/page.js:1325-1335 (shown only when unavailableCount > 0) never rendered. The header
length (11) was read correctly but never compared with the window.

Decisions:
- Fix in parsePlaylistData only: in a complete window (not truncated), the header length
  minus the window's video items is the hidden count. Structural, no alert text parsing
  (locale dependent), no playlist id special case, no second "show unavailable" browse call.
- Truncated windows infer nothing (cannot tell hidden from not yet loaded), so the
  truncation dialog is unchanged.
- An empty window infers nothing either, so a payload shape we fail to read still falls
  through to the HTML scrape and the ExtractionError (src/lib/youtube.js:121-133).
- extractors.js, page.js, SongRow.js, SongCardMobile.js unchanged: the counts already flow
  to the notice and the append toast, whose copy has no dashes. The notice is shared by
  both widths, so this is not a row change. Short term fix only, per the user.

Acceptance:
1. Breakcore payload parses to returned 7, loaded 11, unavailable 4, truncated false, length 11.
2. The rule is structural (length minus window, only when not truncated).
3. Truncated: no inference, counts as before.
4. No header length, or length <= window: output unchanged; existing tests pass.
5. Trimmed real fixture test/fixtures/youtube-hidden-unavailable.json plus synthetic tests;
   npm test = baseline plus new tests, 0 fail, 1 todo.
6. Live on :3000: 7 rows and "Showing 7 of 11 songs. 4 are unavailable on YouTube." at
   1280x800 and 375x812.
7. Appending the same playlist gives a toast including "4 are unavailable on YouTube".

## Implementation

- src/lib/youtube.js:302-311: after the window walk, `if (!truncated && loadedCount > 0 &&
  playlistLength > loadedCount)` adds the shortfall to unavailableCount and sets
  loadedCount to playlistLength. playlistLength is read once (src/lib/youtube.js:307) and
  returned at :320.
- src/lib/youtube.js:94-97: JSDoc for fetchPlaylistItems now says loadedCount and
  unavailableCount include items YouTube hides from the window.
- test/fixtures/youtube-hidden-unavailable.json: one live Innertube browse of this
  playlist, trimmed to header, alerts, metadata title and the contents path playlistWindow
  reads (tracking, thumbnail, command and accessibility fields stripped, 7.7 KB).
- test/youtube.test.mjs:173-200: five tests: the real fixture ([7, 11, 4, false, 11]);
  synthetic 3 items over "5 videos" ([3, 5, 2, false, 5]); hidden plus an isPlayable:false
  item ([3, 5, 2, false, 5]); truncated window infers nothing ([3, 3, 0, true, 5]); no
  header and empty window infer nothing.

Results:
- npm test: 170 tests, 169 pass, 0 fail, 1 todo (baseline 165/164/0/1; the one listed
  failure is the known F-28 todo at test/search-replay.test.mjs:272, same as baseline).
- Matching untouched, bench not run.
- Live (todo-run/shots/01/check.mjs, one submit plus one duplicate append, Search All never
  clicked): /api/playlist returned {returnedCount 7, loadedCount 11, unavailableCount 4,
  truncated false, playlistLength 11}; 7 rows; notice "Showing 7 of 11 songs. 4 are
  unavailable on YouTube." visible at desktop and phone, no horizontal scroll on phone;
  append toast "Added 0 songs from Why does my breakcore playlist have drums and bass? · 7
  were already in the queue · 4 are unavailable on YouTube". Screenshots: desktop.png,
  phone.png, desktop-append.png in todo-run/shots/01/.

## Verification

Round 1, all three lenses passed, no must-fix findings.

- Regression: npm test 170/169/0/1 vs baseline 165/164/0/1 (5 new tests at
  test/youtube.test.mjs:173-200). Rule at src/lib/youtube.js:307-311 is guarded by
  !truncated and loadedCount > 0, so truncation dialog (src/app/page.js:476-478) and the
  Innertube to HTML fallback (src/lib/youtube.js:123-129) are unchanged. No song shape,
  route, row component or copy change.
- Acceptance: fixture parses to {7, 11, 4, false, 11}. Live run (todo-run/shots/01/verify-r1.mjs,
  one submit plus one duplicate append, no Search All, 7 automatic osu! searches) shows
  "Showing 7 of 11 songs. 4 are unavailable on YouTube." at 1280x800 and 375x812, no
  horizontal scroll, no dash in notice or toast (r1-desktop.png, r1-phone-full.png, r1-append.png).
- Rules: one structural rule, no playlist id special case, no alert text parsing, bench/
  untouched, no new fetches, no debug logging in src.

Follow-ups (not must-fix):
- Speculative: if YouTube's header length is ever stale in a complete window, the
  shortfall would be reported as unavailable (src/lib/youtube.js:302-311). Informational only.
- Speculative: the append toast truncates long playlist titles with an ellipsis, pushing
  "4 are unavailable on YouTube" out of view (r1-append.png). Existing toast styling.
