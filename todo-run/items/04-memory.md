# 04 Memory leak check

Todo: "is there memory leak problem? the cached beatmaps and pics have to be deleted when the
user pulls up a new search or player search (is song preview cached?)"

## Scope

Current state (before this item):
- Download blob URL: created at src/app/page.js:100, revoked on a timer at page.js:107.
- Covers and avatars are plain `<img loading="lazy">` (BeatmapCover.js:82-85, SongRow.js:83-86,
  SongCardMobile.js:84-87, PlayerSections.js:35-39, PlayerProfile.js:56-59). The browser's HTTP
  and image cache owns the bytes; the app holds no image data, and elements are freed when
  rows unmount.
- Every new search or player search drops the old list: `dropSongList` (page.js:977-983)
  aborts the batch and calls `setSongs([])`. Called from handlePlayerSearch (page.js:228),
  applyPlayerProfile (page.js:278), handleClearPlayer (page.js:444), handleFetchPlaylist in
  replace mode (page.js:458, plus clearPlayerState page.js:209-217) and handleClearList
  (page.js:1180).
- Client side Maps are small and bounded: sectionLoadsRef (page.js:161, cleared page.js:205),
  the preview registry (useAudioPreview.js:31, entries deleted at :149). The artist probe
  cache (osu.js:463) is server side and LRU capped (osu.js:478).
- Gap: song preview. One module scoped `<audio>` (useAudioPreview.js:176-185). A dropped list
  unmounts the covers, the last unregister for the playing key calls `store.stop()`
  (useAudioPreview.js:150-151) -> `stopPlayback` (:62), which only ran `audioEl.pause()`
  (:208-210). The element kept the old preview mp3 as src, with its buffered media, until the
  next play replaced it. Preview audio is otherwise not cached by the app; the browser HTTP
  cache handles b.ppy.sh/preview/{id}.mp3 (osu.js:884).

Decisions:
1. Fix the stop action only (general rule: stopping releases the media), not the triggers.
   Every list drop already reaches `store.stop()` through the mount registry.
2. On stop: pause, null the on* handlers (so the emptied/abort that clearing src fires cannot
   reach the store), `removeAttribute('src')`, `load()`. Keep the single element; reused on
   next play.
3. Pull the browser wiring into an exported `createAudioBackend(audioFactory)` so node tests
   can inject a fake Audio. `createPreviewStore` state machine unchanged.
4. Leave images to the browser cache. Evicting `<img>` bytes by hand is not possible and would
   only force refetches from osu! assets.
5. No user facing copy changes. Matching untouched, bench not required.

Acceptance:
1. After any preview stop (toggle off, onended, fail, last cover unregistering on a dropped
   list), the shared audio element has no src attribute, currentSrc is '' after load(),
   networkState is NETWORK_EMPTY and its on* handlers are null.
2. Starting a preview after a stop plays normally. A stop during loading surfaces no error,
   and no error key is set by the emptied/abort that clearing src causes.
3. The fix lives only in the browser stop callback; createPreviewStore unchanged.
4. test/useAudioPreview.test.mjs keeps passing; npm test >= 165 tests, 0 fail.
5. Playwright on :3000 with stubbed /api routes: after search A (preview played) then search
   B, the old rows are gone, audio src is cleared, heap after forced GC within ~10% or 2 MB.
   No console errors at 1280x800 or 375x812.
6. No user facing copy changes.

## Implementation

What changed:
- `src/lib/useAudioPreview.js:176-243`: the browser wiring moved into an exported
  `createAudioBackend(createAudio, getStore)` (:186) returning the `{ play, stop }` pair the
  store drives. `play` (:213-235) is unchanged in behaviour. `stop` (:236-238) now calls
  `release` (:199-210): pause, null `onended/onwaiting/onstalled/onplaying/onerror`, then
  `removeAttribute('src')` + `load()` so the element drops the old preview's buffered media
  (without `load()` Chromium keeps the resource). Handlers are nulled first so the
  `emptied`/`abort` that clearing src fires can never reach the store as a failure.
  The app instance is `createPreviewStore(createAudioBackend(() => new window.Audio(), () => store))`
  (:240-243). `createPreviewStore` (:19-170) is untouched.
- A stop during loading rejects the pending `play()` with AbortError; the store has already
  bumped its token (useAudioPreview.js:60), so the rejection is swallowed (:126) and no error
  key is set. Covered by a test.
- No trigger changed: every list drop reaches `store.stop()` via the mount registry
  (useAudioPreview.js:144-153), so fixing stop covers new search, player search, clear list and
  clear player. Images left to the browser cache (decision 4). No copy changed.
- `test/useAudioPreview.test.mjs:328-457`: fake media element (`makeFakeAudio`) plus 6 backend
  tests: stop after play releases (src null, pause/remove/load, handlers null); replay after
  stop reuses one element and resolves; stop during loading gives no error; last unregister
  releases; onended/onerror release and only the failed key is flagged; stop with nothing
  loaded never creates the element.

Results:
- `npm test`: 187 tests, 186 pass, 0 fail, 1 todo (the known F-28 todo, item 07)
  (todo-run/shots/04/test.txt). Baseline was 165/164/0/1; other items added tests since.
- Playwright `todo-run/shots/04/memcheck.cjs` on :3000, every /api/playlist, /api/osu/* ,
  preview and cover request stubbed (0 requests leaked off localhost), 8 cycles of: load 40 song
  playlist A, play a preview, player search (drops list), load B, play, toggle off, play, clear
  list. At 1280x800 and 375x812, every cycle: old rows 0 after the drop, audio `src` null,
  `networkState` 0 (NETWORK_EMPTY), 0 handlers bound, replay after stop plays, 0 "Preview
  unavailable", 1 Audio instance total, 0 console errors
  (todo-run/shots/04/memcheck-results.json, screenshots desktop_*/phone_*.png).
- Heap after forced GC at the end of each cycle: 13.97 14.19 14.29 14.35 14.42 14.59 14.62
  14.63 MB (growth 0.66 MB over 8 cycles, flattening; same on phone). A snapshot diff of cycle
  1 vs 7 showed no DOM/Fiber growth; the residue is V8 `code` (JIT, 443 KB) and DevTools
  network/performance entry buffers, which are capped.
- Harness pitfall found and fixed: a first run grew 0.55 MB per cycle with whole detached
  tables retained. The retainer path was `(Global handles) / DevTools console` -> the clicked
  play button: Playwright `page.click`/`waitForSelector` element handles kept each clicked row
  and its table alive. Not an app leak; the script clicks via `page.evaluate` now
  (memcheck.cjs, `clickFirst`).
- Matching untouched, bench not run.

## Verification

Round 1, all three lenses passed, no must fix findings.

- Regression: `npm test` 187/186/0/1 (only the known F-28 todo). `createPreviewStore`
  (useAudioPreview.js:25-135) byte identical to HEAD; importers (BeatmapCover.js:5,
  PlayerSections.js:13, SongTable.js:11) unaffected. `verify_currentsrc.cjs` showed clearing src
  fires only abort/emptied with handlers already nulled (useAudioPreview.js:199-210). Reran
  memcheck.cjs at both viewports: rows 0, src null, networkState 0, heap +0.45/+0.42 MB
  (verifier-memcheck-results.json).
- Acceptance: independent `verify-acceptance.cjs` (all network stubbed) covered list replace,
  toggle off and drop during loading, onended, fail, replay after fail, player profile drop and
  Clear this player, plus 6 heap cycles. Every stop path: src null, networkState 0, 0 handlers,
  1 Audio instance; heap 17.30 to 17.71 MB (verify-acceptance-results.json,
  verify-acceptance-phone-only.json).
- Rules: no user facing copy changed, no debug hooks or logging, bench/ untouched, fix is one
  general release in the backend stop, comment density matches.

Follow ups (not must fix):
- `currentSrc` keeps the old URL string after `removeAttribute('src'); load()` in Chromium (per
  spec); the resource is released (networkState 0), so the criterion wording was too strict.
- Speculative, pre existing: `toggle()` plays in a microtask (useAudioPreview.js:115-117); a
  `stop()` in the same tick can let the backend play with no active key (:215-235 has no token
  check).
- Heap creeps about 0.07 MB per cycle, attributed to JIT code and capped DevTools buffers.
- Submitting a second playlist appends rather than replaces; only Clear list, player search and
  clear player drop the list (existing behaviour).
