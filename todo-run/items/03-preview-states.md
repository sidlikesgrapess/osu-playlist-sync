# 03 Song preview loading and error states

Todo: "song preview should show a loading or errors. (network) as song as its loading it
should show a buffering animation"

## Scope

Current state (before this item):
- `createPreviewStore` (src/lib/useAudioPreview.js:19-125) tracks only activeKey/loadingKey
  (21-22, snapshot 32-33). The browser instance (142-154) wires only `audio.onended`
  (148). No `error`, `waiting`, `stalled` or `playing` listener, so a network drop or decode
  error after play() resolves leaves activeKey set: wave bars animate over silence and no
  error shows. Mid play buffering is invisible.
- BeatmapCover (src/components/BeatmapCover.js:61) uses `showActive = isPlaying ||
  isPreviewLoading`, so loading draws the same wave bars as playing (143-148).
  `previewError` is local state (44), set only when the toggle promise rejects (69-72),
  and reported up via `onPreviewErrorChange` (53-56).
- Rows keep a local previewError copy: SongRow.js:29/231-235, SongCardMobile.js:29/226-230,
  PlayerSections.js:103/173-177. The alt picker (SongTable.js:529-548) passes no error
  callback, so its error is tooltip only.

Decisions:
1. Buffering visual: the app's existing loading idiom, lucide `Loader2` with
   `className="spin-slow"` (globals.css:181-188), colour #ff66aa, sized from
   `playIconSize`, on the same `activeOverlayBg`. No new CSS.
2. Spinner shows for initial loading and for mid play `waiting`/`stalled`; wave bars come
   back on `playing`. `isPreviewLoading` row prop now means "busy, not audibly playing"
   (fed from `isBuffering(url)`), so no extra prop threads through the memo'd rows.
3. Errors: the single existing message "Preview unavailable" for every failure, before or
   after start. The store owns errors as a set of errored keys, cleared when that key is
   toggled again. Rows get a `hasPreviewError` boolean prop in place of local state and
   the `onPreviewErrorChange` callback. The cover shows the Play icon, so a click retries.
4. Per attempt guard: `play()` assigns `audio.onerror/onwaiting/onstalled/onplaying/onended`
   bound to the key; reassigning replaces the previous handlers. Store entry points are
   no ops unless the key is the current activeKey/loadingKey. A new src fires abort, not
   error, so switching tracks does not false flag.
5. No stall timeout (speculative complexity). Matching untouched, no bench needed.

Acceptance:
1. Snapshot gains bufferingKey and errorKeys, refreshed only on real change; existing
   fields and the 10 existing tests unchanged and passing.
2. `setBuffering(key, bool)` and `fail(key)` are no ops for a key that is not the current
   active/loading key.
3. `fail(activeKey)` clears active/loading/buffering, calls player stop once, marks the key
   errored; `toggle(key)` clears that key's error and retries; a live play() rejection also
   marks the key errored. BeatmapCover's local previewError removed.
4. Browser instance wires error, waiting, stalled, playing, ended per attempt.
5. `useAudioPreview()` returns `isBuffering(url)` and `hasError(url)`; SongTable (desktop,
   mobile, alt picker) and PlayerSections pass them as plain booleans.
6. BeatmapCover renders idle (Play), buffering (Loader2 spin-slow), playing (wave bars).
   Clicking while buffering stops.
7. "Preview unavailable" in SongRow, SongCardMobile and BeatmapRow from the new prop, for a
   failed start and for a failure after start. Cover returns to Play with title/aria
   "Preview unavailable". No dash in copy.
8. New unit tests in test/useAudioPreview.test.mjs; npm test 165 + N, 0 fail, 1 todo.
9. Live check at 1280x800 and 375x812: delayed preview shows spinner then bars; aborted
   preview shows "Preview unavailable" and Play; no React console errors.

## Implementation

Store (src/lib/useAudioPreview.js):
- New state `bufferingKey` (25) and `errorKeys` (29, a Set replaced on change, never
  mutated). Both are in the cached snapshot (38-39), which is still replaced only where
  state really changed, so `getSnapshot` stays reference stable.
- `isCurrent` (43) is the stale rule for media events: a key must be the current
  activeKey or loadingKey. `setError` (45) returns early when nothing changes.
- `stop()` also clears bufferingKey (59).
- `setBuffering(key, bool)` (71) and `fail(key)` (82) are no ops for a non current key and
  for no change. `fail` marks the key (84) and calls `stop()`, which bumps the token, so a
  play() rejection arriving after the error event is swallowed as stale.
- `toggle` clears bufferingKey and the key's error on a fresh attempt (108-109, the retry);
  a live rejection marks the key errored (129-130). Error ownership now lives only here.
- Browser instance assigns `onended/onwaiting/onstalled/onplaying/onerror` per attempt,
  bound to that attempt's URL, before setting `src` (195-205). Property assignment
  replaces the previous attempt's handlers. `stalled` counts only when
  `readyState < HAVE_FUTURE_DATA`, because a stall with audio still buffered would never be
  followed by a `playing` event to clear the spinner.
- Hook adds `isBuffering(url)` (loading or bufferingKey) and `hasError(url)` (235-237);
  the server snapshot carries the new fields (213).

Cover (src/components/BeatmapCover.js):
- Local `previewError` state and the `onPreviewErrorChange` effects removed; new
  `hasPreviewError` prop (36). The toggle handler only swallows the rejection (65).
- Overlay: `isPreviewLoading` draws `Loader2` spin-slow #ff66aa at `playIconSize + 3` on
  the same activeOverlayBg (133); wave bars only when playing and not buffering; Play icon
  otherwise. Title/aria "Preview unavailable" when errored and idle (54-55); busy or
  playing reads "Pause audio preview", and a click stops.

Rows and parents:
- SongRow.js:20/231/252, SongCardMobile.js:20/226/258, PlayerSections.js:100/172/162 take
  `hasPreviewError` as a plain boolean prop (memo intact) and show the existing
  "Preview unavailable" text from it.
- SongTable.js:36 destructures `isBuffering`/`hasError`; desktop 229-230, mobile 252-253,
  alt picker 499/546 pass them. PlayerSections.js:303 and 487-488 likewise.
  `isPreviewLoading` now means busy but not audibly playing, so no new buffering prop.

Tests (test/useAudioPreview.test.mjs:199-330): 8 new tests covering loading without
flags, mid play waiting/playing, fail after start (stop once, flags, idempotent), fail
during loading with a swallowed stale rejection, stale events for superseded and stopped
keys, live rejection flags then retry clears, an error surviving another key playing, and
snapshot reference stability for no op events.

Results:
- `npm test`: 181 tests, 180 pass, 0 fail, 1 todo (the known F-28 todo). Baseline 165
  plus 8 from items 01/02 plus 8 here. Output in todo-run/shots/03/test.txt.
- Live (todo-run/shots/03/preview-states.cjs, results.json, one osu! search, 2 preview
  fetches per viewport): at 1280x800 and 375x812, a preview held 4 s shows the spinner and
  no wave bars; once audio starts, 5 (desktop) / 3 (phone) wave bars; an aborted preview
  shows "Preview unavailable" text in the row and the Play icon with aria "Preview
  unavailable". Screenshots 03_{loading,playing,error}_{desktop,phone}.png. console.txt
  holds only the two `net::ERR_FAILED` lines for the deliberately aborted requests; no
  React errors.
- Not checked live: a failure or stall after playback began (the fake player tests are
  the proof for that logic; that Chromium fires `error`/`waiting` promptly on a mid play
  drop is assumed, speculative).
- Matching untouched, bench not run. `next lint` is unconfigured here (interactive setup
  prompt), so no lint run.

## Verification

Round 1, three lenses, all passed. No must fix findings.

- **Regression**: ran `npm test` (181 tests, 180 pass, 0 fail, 1 todo, the known F-28
  todo; baseline 165/164/0/1). Checked removed `onPreviewErrorChange` has no callers, all
  BeatmapCover usages pass `hasPreviewError`, desktop and mobile rows changed alike, no
  matching/route/bench files touched, and stop does not fire a false error. Live
  results and screenshots agree with acceptance.
- **Acceptance**: store criteria (bufferingKey, errorKeys, stale event guard, retry) and 8
  new tests confirmed. Live Playwright at 1280x800 and 375x812: spinner while loading,
  wave bars when playing, element `waiting`/`playing`/`stalled`/`error` events drive the
  UI, error shows Play icon plus "Preview unavailable" in SongRow, SongCardMobile and
  PlayerSections (mocked routes). Verifier used 2 live osu! searches (first script
  crashed), now cached in `shots/03/search-cache.json`.
- **Rules**: no dashes in new copy, no per item special casing, reuses existing
  `spin-slow` and overlay, no CSS change, no debug logging, bench untouched.

Follow ups (not must fix):
- While buffering the button reads "Pause audio preview" (allowed by acceptance).
- `isLoading` and `loadingKey` are still returned by the hook with no consumer.
- The alt picker shows the error only as icon plus aria/title, no text line.
- A real network drop mid play was not reproduced live (Chromium buffered the whole
  ogg under throttling); covered by synthetic element events and unit tests.
