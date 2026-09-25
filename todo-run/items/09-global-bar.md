# 09 Global top bar, keep both result sets

## Scope

**Item.** "The top bar that has the download options is not global. When doing player search it
deletes all the old song search results that we ticked and vice versa."

**Decision (USER).** Keep both result sets across mode switches. The download bar count and the
download itself cover the union of ticked beatmaps from both sides, deduped by beatmapset id.

**Current state (scope stage).** page.js keeps ONE song list (`songs`, page.js:119) and ONE
selection (`selectedIds`, page.js:137) for both sides; the view is picked by `playerProfile`.
- Player beatmaps merge into the same list (mergeSongs page.js:330-337, loadSection page.js:376).
- A player search wipes the playlist: handlePlayerSearch page 1 (page.js:236-242) and
  applyPlayerProfile (page.js:288-290) call dropSongList and clear the selection.
- A playlist search wipes the player: handleSubmitInput forces a replace when a profile is set
  (page.js:203) and handleFetchPlaylist calls clearPlayerState (page.js:467-473).
- dropSongList (page.js:981-988) bumps songListGenerationRef, cancels a batch, empties `songs`.
- Other whole selection wipes: prune effect (page.js:182-189), rematchVisiblePage (723),
  handleSelectAll (918), handleSelectConfirmed (924), handleDeselectAll (928),
  handleClearPlayer (452-455), handleClearList (1184-1187).
- Two StatsBar instances (page.js:1256-1277 player, 1294-1367 playlist); `searchMode` lives
  only in PlaylistInput (PlaylistInput.js:88).
- Download count is selectedIds.size (page.js:1265, 1354); targets from getSelectedSongs
  (page.js:1032). ZIP name page.js:1092-1094. ExportModal gets `songs` (page.js:1430).
- Existing bug item 10 should own: nothing clears playerProfile when a new name search starts,
  so second search results hide behind `!playerProfile` (page.js:1244).

**Plan.**
- `songs` = playlist only, new `playerSongs`. Two selection sets `playlistSelectedIds`,
  `playerSelectedIds`. Lift `searchMode` into page.js (controlled prop of PlaylistInput);
  the view is `searchMode`.
- Split dropSongList into dropPlaylist (bumps the generation) and dropPlayer (does not).
- New pure helper `src/lib/selection.js`: union of ticked matched beatmaps across sides, deduped
  by beatmapset id, playlist first; union of matched for Export; ZIP base title.
- One StatsBar, above the active view, whenever either side has content. Its metrics follow the
  active view; its download count, Download/ZIP and Export follow the union.
- Filters: mode/status always refilter the player sections (free) and rematch playlist rows when
  any exist. Prune effect only touches player ticks.

**Acceptance.**
1. Playlist ticks survive a player search and a view switch (same rows, ticks, page, title).
2. Player profile, sections and ticks survive a playlist search and a view switch.
3. Download / ZIP / count = union of ticked matched beatmaps, deduped by beatmapset (N+M-K), in
   both views; the batch fetches exactly those sets once each.
4. StatsBar shows in both views whenever either side has content.
5. A new player search replaces the old player only; playlist untouched.
6. A playlist search into an empty playlist touches nothing on the player side; with rows it
   appends. Each side's trash clears only its side.
7. SongTable select/deselect and counts are playlist only; section select all is that section only.
8. Mode/status: player sections refilter for free and prune only hidden player ticks (F-12);
   playlist ticks only drop by the playlist rematch rule.
9. A player search does not bump songListGenerationRef (item 08). Replacing/clearing the
   playlist still does.
10. Switching views stops a playing preview and clears the audio src (item 04).
11. page.js stays the only mutator of the song shape. No matching change.
12. No new user copy uses a dash as punctuation.
13. npm test >= 165 tests, 0 fail, with new tests for the union helper.

**Notes for item 10.**
- (a) The StatsBar trash title "Clear playlist results" is wrong in the player view.
- (b) A new name search now clears the current profile; Change player may want to route
  through the results list instead.
- (c) handleClearPlayer and the trash both call osuAudio.playClick, and StatsBar clicks too
  (double sound).
- (d) Decide whether trash in the player view should also offer going back to results.

## Implementation

Each side keeps its own rows and its own ticks. One StatsBar reads the union of both, deduped by beatmapset.

- `src/lib/selection.js` (new, pure):
  - `selectedBeatmapEntries` (:17) returns the ticked, matched sets once each, with the sides that ticked them.
  - `matchedBeatmapUnion` (:38) drives the Export list and the "everything selected" state.
  - `soleOwnerSides` (:57) says which side a running batch depends on.
  - `zipBaseTitle` (:71) names the ZIP after the player, the playlist, or the default for a mix.
- `test/selection.test.mjs`: 9 tests covering the N + M - K dedupe, empty sides, stale ticks, the sole owner and the ZIP name.
- `src/app/page.js`:
  - Split state:
    - `playlistSelectedIds` / `playerSelectedIds` (:140-141) replace `selectedIds`.
    - `playerSongs` (:166) is new.
    - `searchMode` (:169) is lifted from PlaylistInput and chooses the visible view.
  - Submitting sets the mode (:214). `handleSearchModeChange` (:222) only switches the view and never drops results.
  - The F-12 prune now touches only the player ticks (:196, :410).
  - A playlist search replaces only the playlist (:476 `isAppending`), and a player search replaces only the player.
  - One toggler per side through `toggleIn` (:914).
  - Clearing one side:
    - `dropPlaylist` (:1004) keeps the item 08 generation bump.
    - `dropPlayer` (:1015) cancels a running batch only when that batch holds a set that only the player ticked (`cancelBatchHolding` :994, `batchSoleSidesRef` :956).
    - The trash (`handleClearList` :1226) and Change player (`handleClearPlayer` :467) each clear only their own side.
  - The batch and ZIP read `selectedEntries` (:1065) through `beginSelectionBatch` (:1071). The ZIP name comes from `zipBaseTitle` (:1132).
  - Render:
    - `downloadableSongs` (:1244), `otherSideNote` (:1246) and `hasAnyResults` (:1249) feed one `statsBar` element (:1250).
    - That element is placed in the player view (:1335) and in the playlist view (:1369). Each view's rows are gated on `isPlayerView`, so audio previews unmount and item 04 releases them.
    - ExportModal gets the union (:1490).
  - The mode and status filters rematch both sides (:748, :798). The Refetch gate is now `songs.length === 0`.
- `src/components/StatsBar.js`:
  - New props (:24-31): `clearTitle`, `downloadableCount`, `downloadsLocked`, `otherSideNote`.
  - Disabled flags at :35-38.
  - The note is at :100. The trash renders only when `onClearList` is set (:252) and is titled per side (:274).
- `src/components/PlaylistInput.js`: `searchMode` is controlled by page.js (:85-87, :143-144).

### Verification

- `npm test`: 231 of 231 pass.
- `todo-run/shots/09/verify.cjs`:
  - Playwright, every API, mirror and preview stubbed, no osu! calls.
  - Results: 20 of 20 checks at 1280x800 and 20 of 20 at 375x812, with 0 console errors and 0 leaked requests.
  - What it covers:
    - 9 playlist ticks plus 5 player ticks sharing 2 sets gives 12, and the bar shows 12 in both views.
    - The "Includes N ticked in ..." note is correct in each view.
    - Rows and ticks survive switching views both ways.
    - A player search keeps the playlist ticks, and a playlist search into an empty list keeps the player.
    - Each trash clears only its own side.
    - Download fetched exactly the 12 union sets, once each.
    - Switching views stops and releases a playing preview (item 04).
  - Screenshots are `desktop_*.png` / `phone_*.png`, and the results are in `verify-results.json`.
- No bench run: no change to matching.

### Seen, not changed

- The URL box is shared between the two modes. After a player search, switching back to Playlist still shows the player URL (see `phone_3_playlist_back.png`).
- In the player view, a mode or status change also rematches the hidden playlist page, which spends search calls.
- `downloadsLocked` follows the global `isSearching`, so a hidden playlist search also locks the player view's download buttons.

## Verification

Round 1, three lenses, all passed with no must-fix findings.

- **Regression**: npm test 231/231 pass (baseline 165); npm run bench SHIPPED 31/6/0/752, same as baseline; no API route, osu.js, collection.js, song.js or row component changed; no leftover old names; item 08 generation bump kept (only dropPlaylist bumps it); stubbed verify.cjs 20/20 at 1280x800 and 375x812, 0 console errors, 0 leaked requests.
- **Acceptance**: acc.cjs (stubbed) desktop 19/19, phone 18/18: rows, ticks and page survive a view switch; union count N+M-K in both views; new player search replaces only the player side; append keeps the player; each trash clears only its own side; SongTable bulk controls touch playlist rows only; ZIP fetched each set once; preview released on switch. Pacer test: player lookup mid Search All did not stop it (30/30). Live check: Banger Showcase sample, Download (4) after 2 unticked.
- **Rules**: no dash punctuation in new copy; no dead code or debug logs; bench/ untouched; general rule (per side selection sets plus a pure union helper), no special case lists; verify script makes no external requests.

### Follow-ups (not must-fix)

- In Player view a mode or status change also rematches the hidden playlist page: spends osu! search calls, clears playlist ticks the user cannot see (22 to 14 in acc run), and locks download buttons meanwhile. Per F-12 design.
- downloadableCount counts hidden player sets while ticks are pruned to visible ones, so after a filter "Download All" may show as "Download (N)" (speculative, predates this change).
- The URL box is shared by both modes; Playlist view can show a player URL beside "Add More Songs".
- For item 10: double click sound on trash (page.js handleClearPlayer/handleClearList plus StatsBar onClick); trash hidden when a view has nothing of its own; batch cancel depends on soleOwnerSides.
