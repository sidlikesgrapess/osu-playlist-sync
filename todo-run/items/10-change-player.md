# Item 10: Change Player vs trash

> "the Change player button and the trash icon is confusing. Change player deletes the search and so does the trash icon. I think change player should just go back to the prev screen with the player results."

## Scope

Builds on item 09 (1fc967d). Branch todo-fixes at 2bbc133.

### Current state (before this item)

- Change Player (PlayerProfile.js:128-155, title "Clear this player") calls onClear, wired to handleClearPlayer (page.js:467-471), which calls dropPlayer (page.js:1015-1020) and clearPlayerState (page.js:241-249). It wipes the profile, the ticks and the results list.
- applyPlayerProfile empties the results list (page.js:302-303), so a back step has nothing to show. handleSelectPlayer (page.js:319-342) always fetches /api/osu/player?userId.
- Hint (a), the per view trash tooltip, was already fixed in item 09 (page.js:1262-1263, StatsBar.js:24).
- Hint (b), a stale profile hiding new results, was already fixed in item 09 (page.js:256 dropPlayer on a page 1 search). But paging the results calls handlePlayerSearch(query, page) and a page change back to 1 would drop too.
- Hint (c), the double click sound, is present: PlayerProfile.js:131 + page.js:470, StatsBar.js:256 + page.js:470, StatsBar.js:256 + page.js:1229.
- Not matching related. No bench run.

### Decisions

- USER: Change Player keeps the loaded profile and its ticks and returns to the player results list, deleting nothing. Picking the same player again restores it with no refetch; picking another player replaces the player side.
- USER: the trash clears only the loaded side ("Clear player results" / "Clear playlist results").
- USER: one click sound per action. No dashes as punctuation in copy.
- ASSUMED (scope stage): a pasted profile link has no results list, so Change Player shows the empty player view with a "Back to {username}" chip.

### Acceptance

1. After a name search and a pick, Change Player makes no /api/osu/player request, shows the same results list (same names, page, "N players found" header), and hides the profile card and sections.
2. The retained player's ticks still count: StatsBar count and Download (N) unchanged; union N + M - K still holds.
3. Picking the same player again makes no userId or beatmaps request; profile, sections (open state) and ticks come back as they were.
4. Picking a different player replaces the player side (ticks empty); playlist ticks unchanged.
5. Paging the results list while a profile is retained does not drop it. A new page 1 name search still drops it.
6. Pasted profile link: Change Player returns to the empty player view, deletes nothing, and a way back stays visible.
7. Trash tooltip and aria-label: "Clear player results" in the player view, "Clear playlist results" in the playlist view.
8. Player trash clears profile, results list and player ticks, playlist untouched; playlist trash clears only the playlist.
9. Change Player, player trash and playlist trash each call osuAudio.playClick exactly once.
10. Change Player's title no longer says "Clear this player"; it describes going back. No new copy uses dash punctuation.
11. Layout fine at 1280x800 and 375x812, 0 console errors.
12. npm test: 231 or more, 0 fail, todo count unchanged. No bench (matching untouched).

## Implementation

No matching code touched (scoreBeatmapMatch, searchOsuBeatmaps, titleCleaner, matchStrictness), so no bench run.

- `src/lib/playerView.js` (new): `playerViewScreen({ profile, resultsCount, browsing })` picks the screen (`profile` / `results` / `empty`) and the retained player to go back to (`backTo`); `isRetainedPlayer(profile, user)` compares ids as strings. Pure, tested in `test/playerView.test.mjs` (6 tests).
- `src/app/page.js:166` new state `isBrowsingPlayerResults`: true after Change Player; the profile, sections and ticks stay in state, hidden.
- `src/app/page.js:245-253` clearPlayerState resets the flag, so the trash and a new search (via dropPlayer) end browsing.
- `src/app/page.js:258-262, 300` handlePlayerSearch takes `{ isPageChange }`; only a new search drops the player. Paging the results list (including back to page 1) keeps the retained player. Previously `page === 1` decided, so paging back to page 1 would have dropped it.
- `src/app/page.js:305-315` applyPlayerProfile no longer empties playerResults / playerResultsTotal, so the list survives a pick and Change Player needs no API call. It also cancels a batch owned only by the old player (`cancelBatchHolding('player')`, :307) since the old player's songs are replaced.
- `src/app/page.js:328-332` handleSelectPlayer: picking the retained player just clears the flag and returns. No /api/osu/player?userId, no beatmaps request; sections, their open state and ticks come back as they were. Any other pick takes the old path and replaces the player side.
- `src/app/page.js:481-484, 1247-1250` handleClearPlayer / handleClearList no longer call osuAudio.playClick; the StatsBar trash (StatsBar.js:256) and the Change Player button (PlayerProfile.js:133) own their one click, the same convention as every other button.
- `src/app/page.js:488-491` handleChangePlayer: sets the flag, clears the error. Deletes nothing.
- `src/app/page.js:1263-1267, 1362-1394` render from `playerScreen`: back chip when a player is retained but hidden, results list on `results`, profile card and PlayerSections on `profile`. StatsBar stays mounted, so the retained ticks keep counting in Download (N).
- `src/components/PlayerProfile.js:9, 134, 153, 155` prop renamed `onClear` to `onChangePlayer`; title is `backTitle` ("Back to player results", or "Back to player search" after a pasted link with no list, page.js:1381); icon X became ChevronLeft so it reads as navigation.
- `src/components/PlayerResults.js:155-197` new `PlayerBackChip` ("Back to {username}"), shown above the results list or on the empty player view (the pasted link case), plays one click and restores the retained player.
- Trash: item 09 wiring already right and kept (StatsBar.js:24, 274-275; page.js clearTitle 'Clear player results' in the player view).

### Checks

- `npm test`: 237 tests, 237 pass, 0 fail, 0 todo (231 from item 09 plus 6 new; the todo count is unchanged from item 09's run).
- `todo-run/shots/10/verify.cjs` (stubbed Playwright, 1280x800 and 375x812): 35/35 checks pass on each viewport, results in `verify-results.json`, screenshots `desktop_*.png` / `phone_*.png`. Covers: Change Player makes no request and shows the same list and header; Download (16 = 10 playlist + 6 player) unchanged; re-pick of the same player makes no userId/beatmaps request and restores ticks; a different player resets player ticks only; paging keeps the retained player, a new search drops it; trash titles and aria-labels per view; each trash clears only its side; one playClick per action; pasted link shows the empty view with the back chip; no dash punctuation in new copy; 0 console errors, 0 unstubbed external requests.
- Live check (`live.cjs`) not run in this stage; left to verifying.

## Verification

### Round 1 (passed)

- **Regression**: `npm test` 237/237 pass, 0 fail, 0 todo. Reviewed the diff for page.js, PlayerProfile.js, PlayerResults.js and the new playerView.js. Re-ran `verify.cjs`: desktop 35/35, phone 35/35, request counts unchanged by the back step and re-pick. Grepped callers of onClear, handleClearPlayer, handleClearList, cancelBatchHolding, playClick. No matching code, routes, song shape or row components changed, so bench was not run. Confirmed: old `onClear` prop unused; double click removed; trash labels per view intact; a new search still drops the retained player while paging keeps it.
- **Acceptance**: re-ran stubbed `verify.cjs` (35/35 each viewport, 0 console errors), wrote `extra-verify.cjs` (9/9 each viewport: pick from page 2, section open state, exact ticked ids, back keeps page and header, re-pick with no requests, trash from list view), and ran one live flow `verifier-live.cjs` against real osu! (q=1, userId=1, beatmaps=1; ticks kept). The live `back_chip` FAIL was a script bug (username text node included the country); the screenshot shows the chip correctly.
- **Rules**: no dash punctuation in new copy; no per item special case (general `isRetainedPlayer` / `playerViewScreen`); bench untouched; no console.log or new fetches. The `isPageChange` flag and `cancelBatchHolding('player')` in `applyPlayerProfile` go slightly past the recommendation but are required by the acceptance criteria.

No must fix findings.

### Follow ups (not must fix)

- Speculative: while browsing the list, starting a different player's fetch that fails leaves the old profile hidden with the back chip still visible (page.js:326-332). Looks acceptable.
- Live console shows CSP errors for guest avatars (`osu.ppy.sh/images/layout/avatar-guest@2x.png` blocked by img-src, next.config.mjs:8). Predates item 10; Change Player re-renders the list so it repeats.
- Speculative, pre existing: a section row tick may play two clicks (OsuCheckbox.js:19 and PlayerSections.js:134).
