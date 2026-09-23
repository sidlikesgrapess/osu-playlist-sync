# Critique: client-ui (round 1)

Plan under review: `rebuild-notes/3-client-ui-plan-r1.md`. Code read on branch `rebuild`; `git diff --stat bdc6990 -- src` is empty, so every line number below is the plan's baseline.

## What I ran (commands and results)

| # | Command / read | Result |
|---|---|---|
| 1 | `node -e "console.log(typeof Audio, typeof window)"` | `undefined undefined`. |
| 2 | `curl -s http://localhost:3000/` then grep | `200`, 23 KB, HTML already contains "Match Strictness". The `'use client'` page is server rendered, so anything evaluated at module scope of a module `page.js` imports runs in node, where `Audio` does not exist (run 1). |
| 3 | `ls .eslintrc* eslint.config.*`; `ls node_modules/.bin \| grep -i eslint`; `grep lint package.json` | No ESLint config, no eslint binary; `"lint": "next lint"`. `npm run lint` cannot pass or fail on code; it stops at the setup prompt. I did not run it, to avoid it writing a config into the repo. |
| 4 | `node -e` React version | React 18.3.1, `useInsertionEffect` is a function. The `useStableCallback` design is implementable. |
| 5 | `grep` page.js JSX | Views are exclusive: `{playerProfile && (` at 943 vs `{!playerProfile && songs.length > 0 && (` at 977. Plan's claim holds. `PlayerSections` at 964-972 receives no `mode`/`status` prop. |
| 6 | Read page.js 22-64 | `beatmapToSong` (34-46) sets no `source`, no `extractedArtist`. |
| 7 | Read page.js 285-297, `grep isOpen` PlayerSections.js | `handleToggleSection` closing a section only flips `isOpen`; PlayerSections.js:406 `section.isOpen && (` unmounts its rows. Opening an unloaded section calls `loadSection` (page.js:294), which sets `isLoading`. |
| 8 | Scratch `planstop.mjs` (temp dir): plan's PlayerSections rule "stop when any `section.isLoading`" against three `sections` transitions | collapse a section: **no stop**; open a different unloaded section: **stops**; local re-filter of `allItems` (matching-player's F-12 design): **no stop**. Wrong in both directions. |
| 9 | `grep -n "setAltPickerSong(null)\|altPickerSong &&" SongTable.js` | Picker mounts at 429 and closes at 473, 502 with no audio handling. The alt preview id is `alt-${match.id}` (493, 538). |
| 10 | Read page.js 580-611, 861-886 | `narrowMatchesToRanked` keeps `return song` for untouched songs (memo friendly) but swaps `matchedBeatmap` in place. `handleSelectAlternativeMatch` swaps `matchedBeatmap` and keeps `song.id`. `handleClearList` empties `songs`, which unmounts SongTable (977), so the unmount stop covers it. |
| 11 | `grep` SongRow / SongCardMobile | Mark: `match?.artistOverride` only (SongRow:64, Mobile:69). Notice: `match.artistOverride && song.extractedArtist` (SongRow:228, Mobile:223). `imgError` state (22) is never reset. |
| 12 | `grep` PlayerSections.js | `allItems` read at 340 and used for Select All (444-450) and the row map (486). Cover hover `scale(1.06)` at 152. BeatmapRow calls `onToggleAudio(song.id, ...)` at 164. |
| 13 | `grep client-ui` in the three sibling plans, then read those ranges | matching-player plan 196-202 edits SongRow.js:228 / SongCardMobile.js:223 (client-ui files) for `titleOnly`. Lines 218-223 and 252-257 move collection filtering "from osu.js to client" (see also 341-345) and hand the `visibleItemsFor(type, allItems, mode, status)` call site in PlayerSections to client-ui. Line 112: `makeSong` defaults `extractedArtist = ''`. Line 126: player songs get `source: 'osu-player'`. downloads-cost plan 159, 165-168, 213-216: `onCancelBatch` / `isBatchActive` are "wired by client-ui" at the page.js JSX sites; the `handleClearList` reset of download state is left "to client-ui". |
| 14 | `grep` 2-findings.md for F-12, F-16, F-44, F-33 | F-12 high, F-16 high, F-44 low, F-33 medium. |
| 15 | `grep -n "^export" beatmapFormat.js`; `grep getStatusBadgeStyle src/components` | `getStatusBadgeStyle` exists; the 4 badge sites the plan names are real (SongRow:28, Mobile:28, PlayerSections:88, SongTable:492). |
| 16 | `grep "^  return\|^export default"` page.js | There is no early return in `Home` before `return (` at 888, so placing `useStableCallback` hooks just before it is legal. |

Not run: `npm run bench` and `bench:cost`. The plan touches neither `src/lib/osu.js` nor `matchStrictness.js`, and bench imports only `osu.js`, so contracts 4 and 5 are not in play. I made 0 of 3 live `/api/osu/*` calls and 0 of 2 mirror requests. The only server request was `GET /` (run 2).

## Blocking

### B1. F-21 is not fixed. The stop rule is a trigger list, and it misses in both directions
Plan "Target design", cross-cutting audio-stop triggers (lines 68-78). F-21's evidence names the missing rule: "no cleanup when the owning row unmounts". The plan instead stops on a set of component-level events, `[currentPage, pageSize, filterText]`, the `isSearching` false to true edge, and "any `section.isLoading`". Run 8 shows the player rule is wrong both ways:
- **Collapsing a section** (page.js:285-292 flips only `isOpen`, PlayerSections.js:406 unmounts the rows) does not stop the preview. That is F-21's reproduction ("keeps playing, with no button to stop it") on the player path.
- **matching-player's F-12 design** re-derives section items locally with no `isLoading` (its plan 218-223). A mode or status change then removes the playing row and nothing stops it.
- **Opening a second, unloaded section** (page.js:294 `loadSection`) stops a preview that is still visible in the first section.
- **Closing the alt picker** (SongTable.js:473, 502) unmounts the `alt-${match.id}` preview's only control, and no trigger covers it (run 9).
- `handleSelectAlternativeMatch` (page.js:861) and `narrowMatchesToRanked` (580-611) swap the cover under an unchanged `song.id`. The plan keys play state by `song.id` (plan line 116), so the new cover shows "playing" while the old set's audio plays.
- Smaller misses: every filter keystroke, and every auto search on page change or "Search All Remaining", stops a preview whose row is still on screen.

This is the "add the case to a list" pattern, and every future mutation path would need another trigger. **General rule:** key play state by what is actually playing (the preview URL, or the set id plus the owner id), not by `song.id`. Each `BeatmapCover` registers that key on mount and unregisters it on unmount or key change. The module stops when no mounted cover holds the playing key. That one rule covers page, filter, section collapse, local re-filter, picker close, alt swap and clear. It also lets the plan delete the ad hoc effects and the section `isLoading` stop.

### B2. "One module-level `Audio` element" crashes the server render as written
Plan "Target design" line 28. `Audio` is undefined in node (run 1), and `/` is server rendered (run 2). `useAudioPreview.js` is imported by SongTable and PlayerSections, which page.js imports, so a module-scope `new Audio()` throws at module evaluation and `/` returns 500. The plan must say the element is created lazily on the first `toggle`, behind `typeof window !== 'undefined'`. `src/lib/soundEffects.js:15` already follows this pattern. Verification must include `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` returning 200 after the hook lands; a browser click test cannot catch this.

### B3. The plan refuses work that two sibling plans assign to client-ui, which leaves a high finding and contract 8 broken on merge
Plan "Cross-workstream interfaces" line 185 says it "Provides nothing new", and "Changes by file" lines 166-168 say "No prop is added or removed". Run 13 shows that is not the case:
- **matching-player / F-12 (high), contract 8.** That plan moves the collection mode/status filter "from osu.js to client" and hands the `visibleItemsFor(type, allItems, mode, status)` call site to client-ui. The read site is PlayerSections.js:340 (client-ui's range). It needs `mode` and `status` props, which page.js:964-972 does not pass today (run 5). If client-ui does not wire it, filters stop applying in player sections after the merge. **Select All** (444-450) must also use the visible list; otherwise it selects rows the filter hides, and they ride into a bulk download.
- **downloads-cost / F-16 (high), F-44.** `isBatchActive` and `onCancelBatch` must be passed at both `<StatsBar>` sites (page.js:947, 1018). `handleClearList` (873-880, client-ui's range) must reset `downloadingIds`, `isDownloadingZip` and the batch flag, or abort the batch. Without this, the Cancel control is dead code and Clear List during a batch leaves stale spinners.

The plan must list both as accepted work, with lines and prop names, in "Changes by file" and "Cross-workstream interfaces".

### B4. The `MatchNotice` interface cannot keep the mark paired with its notice (contract 3, F-49) and collides with matching-player's `titleOnly` edit
Plan "Target design" line 38 and "Changes by file" lines 94-99 and 133-138. `OverrideMark` gets only `artistOverride`; `OverrideNotice` gets `artistOverride` plus `extractedArtist`. Today's notice also requires a non-empty artist (run 11). So when the artist is empty, the mark renders without the notice, and the "one shared prop check" claim is false:
- Plan line 193 says `extractedArtist` is "already populated by matching-player's code". It is not. `beatmapToSong` sets none (run 6), and matching-player's `makeSong` defaults it to `''` (its plan line 112). In `BeatmapRow` this reproduces F-49 exactly: the mark alone.
- matching-player (its plan 196-202) edits SongRow.js:228 and SongCardMobile.js:223, lines this plan deletes, to add `!match.titleOnly` and a "Closest title match:" branch for F-33's salvaged results, which also carry `artistOverride`. The plan's props cannot express `titleOnly`. Either one of the two edits is lost on merge, or a `titleOnly` result gets the "Could not find one by X" copy that D-01 forbids under none trust.

**Fix:** there is one predicate, `overrideNoticeFor(match, song)`, and both pieces use it. It returns `null`, `{ kind: 'artist', artist }` or `{ kind: 'title' }`. It defines the copy for an empty artist (for example "Closest match:" with no name and no dash). The mark renders only when the predicate is non-null. client-ui owns this component, and matching-player's `titleOnly` branch lands inside it, not as a separate edit to SongRow and SongCardMobile.

## Non-blocking

1. **F-20 is only half fixed.** Its fixDirection is "Render the first page of a section and reveal more locally". The plan adds lazy images only, and PlayerSections still renders up to 100 rows per section (486). So plan line 20, "No owned finding is being skipped", is inaccurate. Either add the local reveal (data is already in memory, no extra fetch) or record the deferral.
2. **Two sources of truth for play state.** `BeatmapCover` is "backed by `useAudioPreview()` internally" (line 46), while rows also receive `isPlaying`/`isPreviewLoading` props (lines 91-93, 116). Pick one. If each cover subscribes, every audio event re-renders up to 2x page size covers (both trees are mounted) or hundreds in player sections. Under B1's rule, the parent-props path is the one to keep.
3. **Stale `play()` rejections.** Swapping `src` rejects the previous `play()` with `AbortError`, and autoplay policy rejects with `NotAllowedError`. Neither should show the error state. Tag each toggle with a token and ignore rejections from older ones.
4. **Wrong stability reasoning.** Plan lines 163-165 say `handleSelectAlternativeMatch` and `handleClearList` "need no wrapper" because they close over stable setters. They are still new functions on every render. This is harmless only because SongTable is not memoized and does not pass them to rows. Say that instead.
5. **Count typo.** Plan line 175 says "16 call sites" and then lists 17.
6. **Verification cannot fail.** `npm run lint` checks nothing (run 3), yet steps 1, 2 and 223 use "lint clean" as the gate. Replace it with a `curl` status check of `/` after every step (catches B2 and compile errors). Add a `node --test` over the pure audio state logic (toggle, stale rejection, unregister stops). Replace the manual Profiler look with a render counter behind a dev flag, or keep the Profiler but state a pass/fail number.
7. **Cite X-10 against the contract wording.** The 2-findings client-ui contract says "share hooks, not components", but X-10's fixDirection explicitly allows `MatchNotice` and `StatusBadge`. Cite it so the new components are not later read as a violation. The new component files are also not in the owned-files list; say they are client-ui's.
8. **Error text placement.** Where the `isError` string renders is not specified. Inside a 52 to 68 px cover it clips, or it widens the row at 375 px (contract 10). Use a `title`/`aria-label` on the button plus a line under the match, not text in the cover.
9. **Stale `imgError`.** Give `BeatmapCover` `key={coverUrl}` (or reset on change) so an alt pick does not inherit a failed image (SongRow:22, Mobile:22).
10. **Hover scale lost.** BeatmapRow's cover scales on hover (PlayerSections.js:152), and `BeatmapCover`'s props have no input for it. Add one or note the drop (contract 1).
11. **PlayerSections boundary disagreement.** 2-findings gives matching-player 370-400; its plan claims "~355-403". The client-ui plan says the header is at "335-360esque". Agree on the header's function or element boundary, not on approximate lines.
12. **CSP handoff.** If server-hardening's CSP lands, it needs `media-src` for the preview host (`b.ppy.sh`) and `img-src` for the cover, thumbnail and avatar hosts. Add a post-merge check that a preview plays with the CSP on.
13. **`PlayerProfile.js:56`** avatar image is in no workstream's list for lazy loading and size attributes. Minor; add it or say why not.
14. **Cost claim checked.** Covers and previews go straight to the ppy CDNs and the thumbnail hosts, with no Vercel function, no middleware and no origin transfer. No osu! API change, bundle growth negligible.

## Verdict

Revise. The direction is right: one shared audio owner, shared notice, badge and cover pieces, memoized rows fed by `useStableCallback` at the JSX sites, and lazy images. But F-21 is patched with a trigger list that misses section collapse, picker close and local re-filter, and wrongly stops on an unrelated section load. The module-scope `Audio` breaks the server render. The plan refuses the wiring that matching-player (F-12, contract 8) and downloads-cost (F-16/F-44) hand to it. And `MatchNotice` cannot keep the mark paired with its notice for an empty artist or a `titleOnly` result.

```json
{
  "verdict": "revise",
  "blocking": [
    "B1 Target design lines 68-78: F-21 stop rule is a trigger list keyed by song.id. It misses section collapse (page.js:285-292, PlayerSections.js:406), matching-player's local re-filter, alt picker close (SongTable.js:473,502) and alt swap under the same id (page.js:861), and wrongly stops when another section lazy loads (page.js:294). Simulated in temp planstop.mjs. Replace with mount/unmount registration keyed by what is playing.",
    "B2 Target design line 28: module-level Audio element throws during the server render (node: typeof Audio is undefined; GET / is SSR, 200 with content). Create it lazily in toggle behind typeof window, and verify with curl of /.",
    "B3 Cross-workstream line 185 and Changes by file 166-168 refuse assigned wiring: matching-player visibleItemsFor at PlayerSections.js:340 plus mode/status props at page.js:964-972 (F-12 high, contract 8; Select All 444-450 must use the visible list too), and downloads-cost isBatchActive/onCancelBatch at StatsBar page.js:947,1018 plus the handleClearList reset at 873-880 (F-16, F-44).",
    "B4 MatchNotice lines 38, 94-99, 133-138: the mark checks artistOverride only and the notice also needs extractedArtist, which is '' on the player path (beatmapToSong page.js:34-46, makeSong default). BeatmapRow shows the mark alone (F-49 unfixed). It also cannot express matching-player's titleOnly branch at SongRow.js:228 / SongCardMobile.js:223. Use one predicate for both halves, with empty-artist and titleOnly copy."
  ],
  "nonBlocking": [
    "F-20 'render first page, reveal more locally' half skipped (PlayerSections.js:486 renders all rows); plan line 20 says nothing skipped.",
    "BeatmapCover uses the hook internally while rows also get isPlaying props: two sources of truth and per-cover listeners.",
    "Ignore stale play() AbortError/NotAllowedError via a per-toggle token.",
    "Lines 163-165: handleSelectAlternativeMatch/handleClearList are not stable; harmless only because SongTable is not memoized.",
    "Line 175 says 16 setSongs sites, lists 17.",
    "npm run lint checks nothing (no eslint installed or configured); use curl of / per step, node --test for audio logic, a numeric re-render check.",
    "Cite X-10 against the 'share hooks, not components' contract; claim the new component files as client-ui's.",
    "Error string placement unspecified; keep it out of the 52-68px cover to avoid phone-width overflow.",
    "Reset imgError on cover change (key={coverUrl}).",
    "BeatmapRow hover scale (PlayerSections.js:152) has no BeatmapCover input.",
    "PlayerSections header boundary disagrees across plans (370-400 vs 355-403 vs 335-360); agree by element, not line.",
    "CSP must allow media-src b.ppy.sh and image hosts; add a post-merge preview check.",
    "PlayerProfile.js:56 avatar in no workstream's lazy-load list.",
    "Cost claim verified: CDN traffic only, no API, function or origin cost."
  ]
}
```
