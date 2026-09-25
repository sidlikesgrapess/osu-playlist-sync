# Plan: matching-player (round 1)

Scope: `src/lib/osu.js`, `src/lib/beatmapFormat.js`, `src/app/api/osu/**`, and the owned
ranges of `src/app/page.js` (22-64, 125-333, 408-735) and `src/components/PlayerSections.js`
(the section-header total, ~355-403). `src/lib/matchStrictness.js` and `src/lib/titleCleaner.js`
are read-only for this workstream unless noted.

## Findings resolved

| id | severity | one-line fix |
|---|---|---|
| F-11 | High | `/api/osu/player` and `/api/osu/player/beatmaps` forward `isDemo` from `getOsuUser`/`searchOsuUsers`/`getUserBeatmapCollection` instead of dropping it; the 503 branch becomes `{type:'profile', isDemo:true, user:null}` at 200 |
| F-05 | High | manual search re-derives `{title, artist, source}` from the edited text via the same `cleanSongTitle`/`buildSearchRequest` path as every other song, instead of sending only `q` |
| X-08 | High | one `buildSearchRequest(song, overrides)` used by both `searchTargetSongs` and manual search, so the two request shapes cannot drift again |
| F-30 / X-06 | Medium | one exported `RANKED_STATUSES = ['ranked','approved','qualified','loved']` in `beatmapFormat.js`; `osu.js` imports it instead of keeping its own 3-status copy; upstream `s=ranked` already returns `approved` sets (osu!'s own filter buckets them under Ranked) but the local re-filter at osu.js:739 was throwing them back out |
| F-12 | Medium | `getUserBeatmapCollection` stops baking `mode`/`status` into the response for `most_played`/`favourite` (neither takes either param upstream); client re-filters the cached pool locally on every mode/status change; only `best` refetches, and only on mode change (status is never sent upstream for any type) |
| F-10 | Medium | `loadSection` stops overwriting `section.total` with `entries.length`; keeps the seeded `profile.counts` total and stores the fetched-window length separately as `section.fetched`; header renders "N of TOTAL" when `fetched < total` |
| F-13 | Medium | one request-generation counter (`playerRequestGen` ref) threads through `loadSection`/`reloadPlayerSections`; a response is applied only if its captured generation still matches |
| F-33 (D-01) | Medium | reorder so `titleMatches.length > 0` is checked before the `artistConfidence==='none'` short-circuit, so a title-only salvage match is returned instead of discarded; gated on a **new** `titleOnly: true` flag so the UI never shows the "Could not find one by X" copy for it |
| F-29 | Medium | the score >= 150 early exit only fires when `structuredArtist` is true or the leading verdict is `SAME`; otherwise the loop keeps running so a later query can supply a competing title before locking in |
| F-31 | Low | `/api/osu/player/beatmaps` routes its catch through the same `toRouteError` helper as F-11/F-05, dropping the raw `error.message` upstream-path leak |
| F-22 | Low | `userId` validated as `/^\d+$/` (400 otherwise) in `/api/osu/player` and `/api/osu/player/beatmaps`; `osu.js` path builders wrap `userId` in `encodeURIComponent` defensively |
| F-14 | Low | `fallbacks`/`queries` capped to 3 extra entries (4 total incl. the primary) at both the route (before calling `searchOsuBeatmaps`) and inside `queriesToRun` itself, so a malformed/huge `fallbacks` JSON array can't multiply the call count |
| F-39 | Low | `artistProbeCache` becomes a small LRU (cap 200) with a 30 min TTL; probe *logic* (what gets cached, cache-on-failure-as-null) is untouched |
| F-37 | Low | delete the dead `downloadUrl` field in `formatBeatmapset` (osu.js:905) — confirmed zero readers in `src/` and `bench/` |
| F-48 | Low | playlist append shows a toast "Added N songs" (uses the existing `pushToast`, which is just outside my owned range — see Cross-workstream) |
| UA (rule-driven, not a numbered finding) | Low | every outbound fetch in `osu.js` (`osuApiGet`, the raw search fetch, the token fetch) gets a `User-Agent: osu-playlist-sync/1.0 (+contact)` header; none currently set one |

### Owned findings deliberately NOT fixed (with reason)

- **F-40** (sequential per-track processing) — per D-04, kept sequential. Concurrency-3 fan-out
  already exists at the *track* level in `searchTargetSongs`; adding a second concurrency axis
  inside a single track's query loop buys nothing (the loop already early-exits at score >= 150
  most of the time) and risks out-of-order `bestScore` bookkeeping for a bench-invisible gain.
- **F-41** (two separate dedupe mechanisms: `dedupeByBeatmapset` vs the inline set-id merge in
  `searchOsuBeatmaps`) — per D-05, only a shared *key* helper (`beatmapsetKey(set) => set.id`) is
  extracted; the two dedupe *strategies* stay separate because they merge different things
  (score-vs-score for search, per-difficulty-mode entries for collections) and folding them into
  one function would need a mode-awareness parameter neither caller wants.
- **F-08's upstream `s=` value itself** — not changed. The fetch already asks for the right thing
  (`s=ranked`); the bug was the redundant local re-filter throwing `approved` back out (fixed as
  part of F-30/X-06 above), not the upstream param.
- **`src/lib/matchStrictness.js` curve** — confirmed via `node -e` that `strictnessProfile(50)`
  still returns `{titleFloor:0.5, minScore:70, maxArtistRung:6, salvageFloor:0.92}` exactly. No
  bug found; out of scope per ownership and per contract (4).

## Target design

### `src/lib/beatmapFormat.js` (additions/moves, same file)
- `export const RANKED_STATUSES = ['ranked', 'approved', 'qualified', 'loved']` (replaces the
  private `RANKED_AND_LOVED`).
- `export function isRankedStatus(status)` — unchanged signature, now reads the exported set.
- `export function matchesCollectionFilters(beatmapset, mode, status)` — **moved here** from
  `osu.js` (was private there). Same signature and body; `osu.js` imports it back, matching the
  existing import direction (`osu.js` already imports `isRankedStatus` from here). This lets the
  client (`page.js`) reuse the exact same predicate for local re-filtering (F-12) without
  importing `osu.js` (which holds server-only fetch/token code and must never enter the client
  bundle).

### `src/lib/osu.js`
- Delete the private `RANKED_STATUSES` (line 237) and `matchesCollectionFilters` (lines 239-255);
  import both from `beatmapFormat.js`.
- `getUserBeatmapCollection(userId, type, opts)` — new return shape:
  ```
  { items: NormalizedEntry[], fetched: number, isDemo?: true }
  ```
  `items` is now the **full deduped pool**, filtered by `mode` only when `type === 'best'`
  (upstream already scoped it) — `status` is never applied server-side any more, for any type,
  since no endpoint takes it upstream. The route forwards the whole pool; the client filters.
- `searchOsuBeatmaps` — no signature change. Internal changes only: cap `queriesToRun` to 4
  entries total, gate the score>=150 early exit on `structuredArtist || leadingVerdict==='SAME'`,
  reorder the empty-result branch (F-33), add `titleOnly: true` alongside `artistOverride` where
  applicable, add `User-Agent` to the raw fetch at line 722.
- `getOsuUser`/`searchOsuUsers`/`getUserBeatmapCollection` — no change to their `isDemo`
  passthrough (already correct); the bug is entirely at the route layer (below).
- New private helper, used only inside this file: `withUserAgent(headers)` — small object spread,
  not exported.

### `src/lib/errors.js` (new file, owned by this workstream since it's matching-player-specific;
if server-hardening's `src/lib/http.js` lands first with an equivalent, this folds into it — see
Cross-workstream)
```
export function toRouteError(error, { notFoundMessage } = {}) {
  // error.status is the osuApiGet/.status convention. Returns { status, body }.
  // 429 -> 429 + rate-limit copy (+ Retry-After passthrough if error.retryAfter is set)
  // 404 -> 404 + notFoundMessage ?? generic "not found"
  // else -> 500 + generic copy, NEVER error.message (no upstream-path leak)
}
```
Used by all three `src/app/api/osu/*` routes, replacing the two near-duplicate
`errorResponse`/inline-catch bodies.

### `src/lib/searchRequest.js` (new file)
```
export function buildSearchRequest(song, overrides = {}) {
  // Single source of truth for what a /api/osu/search request looks like.
  // Reads song.cleanQuery/title/extractedArtist/extractedTitle/source/fallbacks/queries,
  // applies overrides (mode, status, strictness), returns a URLSearchParams.
}
```
Both `searchTargetSongs` and manual search build their request through this. Manual search's
edited text is first run through `cleanSongTitle(editedText)` (no channelTitle — there isn't
one) to get `{title, artist, fallbacks, queries}` before calling `buildSearchRequest`; the
`source` sent is `'query'` (existing value already in the documented song contract), never the
row's stale platform tag, so `resolveArtistTrust`'s pool+probe path runs on it like any other
unstructured source instead of forcing high trust in an artist nobody verified.

### `src/lib/song.js` (new file, per X-09/F-32 — thin, additive; does not replace the literal
object shape used everywhere else, only centralizes construction)
```
export function makeSong({ id, index, title, channelTitle = '', thumbnail = null,
  duration = null, source, cleanQuery = '', extractedTitle = '', extractedArtist = '',
  fallbacks = [], queries = [], matchedBeatmap = null, allMatches = [], rejection = null,
  hasSearched = false, isSearching = false }) { /* fills every documented song field,
  throws in dev if source is falsy -- source is load-bearing, never optional */ }

export function songKey(song) { return song.id; }

export function mergeSongs(existingSongs, incomingSongs) {
  // Same external behaviour as page.js's current inline mergeSongs: keyed by songKey,
  // incoming replaces existing on a collision (a fresh fetch is always more current than
  // a cached entry). Used by loadSection; page.js's inline version is deleted in favour
  // of this import.
}
```
`beatmapToSong` in `page.js` is rewritten to call `makeSong({ source: 'osu-player', ... })`
instead of building the literal by hand, closing F-32 (it currently omits `source`/`rejection`/
`fallbacks`/`queries` entirely). `'osu-player'` is a new, deliberate `source` value: `osu.js`'s
`structuredArtist` check (`source==='spotify'||'apple'`) must NOT start trusting it, because a
player-section beatmap's own artist field is authoritative on its face (the song is already
`matchedBeatmap`-filled pre-search) — no scoring ever runs against it, so the value only matters
if a user later re-searches this row manually, at which point it should behave like any other
unstructured source. No change needed in `osu.js` for this since it doesn't add `'osu-player'` to
the structured check; documenting the value is the whole fix.

## Changes by file

### `src/app/api/osu/player/route.js` (51 lines, full file owned)
- Delete local `errorResponse` (lines 6-16); `catch (error) { return toRouteError(error, {
  notFoundMessage: 'No osu! player found for that name or link.' }); }`.
- Line 36-42: `const user = await getOsuUser(profileRef); if (!user) return NextResponse.json({
  type: 'profile', isDemo: true, user: null }, { status: 200 });` (replaces the 503 body).
- Line 46-47: `const { users, total, isDemo } = await searchOsuUsers(query, page); return
  NextResponse.json({ type: 'results', users, total: total || 0, isDemo: isDemo || false, page
  });`.

### `src/app/api/osu/player/beatmaps/route.js` (39 lines, full file owned)
- Line 10: `const userId = (searchParams.get('userId') || '').trim();` gains a
  `/^\d+$/.test(userId)` check alongside the existing `VALID_TYPES` check (same 400 branch,
  extended message).
- Line 24-26: destructure `{ items, fetched, isDemo }` and return `NextResponse.json({ type,
  items, fetched, isDemo: isDemo || false })`.
- Line 27-38 catch block replaced with `toRouteError(error)`.

### `src/app/api/osu/search/route.js` (72 lines, full file owned)
- Lines 31-40: cap `extraQueries` to 3 entries (`.slice(0, 3)`) after building it, before passing
  to `searchOsuBeatmaps` (F-14).
- Lines 43-51: build the call to `searchOsuBeatmaps` unchanged in shape (still receives
  `title/artist/queries/mode/status/strictness/source`); this route is already the target that
  `buildSearchRequest` (client-side) constructs a request against, so no param renaming.
- Lines 65-70: catch block replaced with `toRouteError(error)`.

### `src/lib/osu.js` (907 lines; changes only, see Target design for the "why")
- Lines 237, 239-255: deleted, replaced by `import { isRankedStatus, matchesCollectionFilters,
  RANKED_STATUSES } from './beatmapFormat.js'` (extends the existing import at line 6).
- Lines 264-290 (`getUserBeatmapCollection`): drop `status` from the filter call for every type;
  drop `mode` from the filter call for `most_played`/`favourite` (keep it for `best`, defensively,
  since upstream already scoped it — cheap no-op safety net, not a second source of truth).
- Line 695-702 (`queriesToRun`): wrap the `Array.from(new Set([...]))` result in
  `.slice(0, 4)` (primary + up to 3 fallbacks).
- Line 719/722: add `'User-Agent': 'osu-playlist-sync/1.0 (+https://github.com/<owner>/<repo>)'`
  to both this raw fetch's headers and `osuApiGet`'s headers (line 68-71) and the token fetch in
  `getOsuAccessToken` (not yet read in this session — grep-confirm its headers block before
  editing; same pattern applies).
- Line 757 (`if (bestScore >= 150) break;`): gate becomes `if (bestScore >= 150 &&
  (structuredArtist || leadingVerdictIsSame)) break;` — `leadingVerdictIsSame` computed from the
  same `artistVerdict` call already made inside the loop for the top-scoring candidate this
  iteration (no new call, just reading a value already computed by `scoreBeatmapMatch`'s inner
  logic; if that value isn't already surfaced, `scoreBeatmapMatch` needs to also return the
  verdict alongside the score — smallest version: change its return from a bare number to
  `{ score, verdict }` and update the two call sites at lines 743 and wherever `scoreBeatmapMatch`
  is invoked in `bench/scorers/shipped.mjs` — **cross-workstream-free** since bench imports this
  same function and the bench harness already destructures whatever shape it returns per
  `bench/README.md`'s contract of "replays the real function", but must be re-verified with
  `npm run bench` immediately after, per the mandatory rule for any scoring change).
- Lines 811-843 (empty-result branch): reordered per F-33 — check `titleMatches.length > 0`
  first; when `artistConfidence === 'none'`, tag the salvage results `titleOnly: true` instead of
  `artistOverride: true` (both still get `matchScore: null`); `rejection.kind` stays
  `'artist-unknown'` in this sub-case, but `results` is no longer forced empty.
- Line 905: delete the `downloadUrl` field from `formatBeatmapset`.
- `artistProbeCache` (private Map, currently unbounded): wrap in a tiny LRU (cap 200, 30 min TTL)
  — `get`/`set` wrapper functions replacing direct `Map` calls at the 2-3 existing call sites;
  probe logic itself untouched.

### `src/components/SongRow.js` / `src/components/SongCardMobile.js` (owned narrowly: only the
`artistOverride` copy condition, not general row layout — that belongs to client-ui workstream)
- SongRow.js:228, SongCardMobile.js:223: condition becomes `match.artistOverride &&
  song.extractedArtist && !match.titleOnly` for the existing "Could not find one by X" branch;
  add a sibling branch `match.titleOnly && (<span>Closest title match:</span>)` with no artist
  name in it, immediately before/after the existing block, same visual treatment.
- **Do not touch** anything else in either file — row layout, star colours, selection checkbox,
  etc. belong to client-ui, per the Workstreams table.

### `src/app/page.js` (owned ranges only: 22-64, 125-333, 408-735)
- Lines 34-46 (`beatmapToSong`): rewritten to call `makeSong({ source: 'osu-player', ... })` from
  the new `src/lib/song.js` (F-32).
- Line 56 (`blankMatchState`): gains `titleOnly: false` alongside `rejection: null` so a fresh row
  never trips the new copy branch by accident.
- Lines 236-274 (`loadSection`): line 254 unchanged; line 261 `total: entries.length` deleted —
  `total` is no longer touched here (it stays whatever `applyPlayerProfile`/`reloadPlayerSections`
  seeded from `profile.counts`); a new sibling field `fetched: data.fetched ?? entries.length` is
  set instead. Also: capture `const gen = ++playerRequestGenRef.current` before the `fetch`, and
  guard the two `setPlayerSections` calls with `if (playerRequestGenRef.current !== gen) return;`
  (F-13). `playerRequestGenRef` is a new `useRef(0)` declared once near the other player-state
  refs in this file (inside my owned 125-333 range).
- Lines 300-322 (`reloadPlayerSections`): stops clearing `allItems`/resetting `loaded:false` for
  `most_played`/`favourite` when only `mode` or `status` changed and the section was already
  loaded — those two are re-derived in place via `matchesCollectionFilters` from the existing
  cached pool (imported from `beatmapFormat.js`). Only `best` (when `mode` changed) still clears
  and calls `loadSection`. A derived-view helper `visibleItemsFor(type, allItems, mode, status)`
  is added near `loadSection` and used both here and wherever `PlayerSections` currently reads
  `section.allItems` directly (that read site is in the shared component and out of my owned
  range for `PlayerSections.js` — see Cross-workstream note on `client-ui`).
- Lines 408-510 (`searchTargetSongs`): its inline request-builder body is replaced with a call to
  `buildSearchRequest(song, { mode, status, strictness })` from `src/lib/searchRequest.js`; the
  rest of the concurrency-3 worker loop is unchanged.
- Lines 672-710 (`handleManualSearch`): rewritten per F-05 — runs `cleanSongTitle(editedText)`,
  builds a `source:'query'` song-shaped object via `makeSong`, calls `buildSearchRequest` the same
  way `searchTargetSongs` does, and applies the same `!matched.artistOverride` auto-select guard
  already used elsewhere in this file (so a manual search result never auto-selects a flagged
  match either — closing a second, smaller gap in the same finding).
- `mergeSongs` (currently inline, exact location inside my owned 125-333 range): deleted in favour
  of importing `mergeSongs` from `src/lib/song.js`.

## Cross-workstream interfaces

- **`toRouteError`** (new, `src/lib/errors.js`): if server-hardening's audit produces an
  equivalent generic HTTP-error mapper (e.g. in a planned `src/lib/http.js`), that one wins and
  this workstream's three `osu/*` routes import from there instead — the signature above
  (`toRouteError(error, {notFoundMessage}) -> {status, body}`) is what I need from it either way.
  Coordinate before implementation; whichever lands first, the other imports it.
- **`validate.js`** (if server-hardening ships one): F-22's `userId` integer check would move
  there as a shared `isPositiveIntegerString`/`assertPositiveInt` helper; until then this
  workstream's inline `/^\d+$/.test(userId)` is the fallback and is a one-line swap later.
- **`titleCleaner.js`'s planned `source` parameter (F-28, owned by server-hardening)**: my
  `buildSearchRequest`/manual-search design calls `cleanSongTitle(editedText)` with **no** second
  argument today (no channelTitle for a manually typed query, and no source-awareness exists in
  that function yet). If F-28 adds a `source` param to `cleanSongTitle`, my manual-search call
  site takes it too, passing `'query'` — additive, no rework needed on my side either way.
- **`pushToast`** (F-48, defined just past my owned range in `page.js`): I add one call site (on
  playlist append success) but do not own or modify the toast implementation itself. Confirm the
  exact call signature with whichever workstream owns that range before wiring it in.
- **`PlayerSections.js`** beyond the section-header total (lines ~355-403, which I own): the
  `visibleItemsFor` derived-view helper needs to be consumed wherever the component currently
  reads `section.allItems` to render rows. That read site is outside my owned range — I provide
  the helper and its signature (`visibleItemsFor(type, allItems, mode, status) -> NormalizedEntry[]`)
  and client-ui (or whoever owns the rest of that file) wires the call site.
- **`bench/scorers/shipped.mjs`**: imports `scoreBeatmapMatch` directly from `src/lib/osu.js`. If
  its return shape changes from a bare number to `{score, verdict}` (needed for the F-29 gate),
  bench's call sites need the same destructure. `bench/` is off-limits for me to edit — this is
  flagged as a **risk requiring a 30-second change in bench/scorers/shipped.mjs by whoever
  implements this plan**, verified by `npm run bench` passing with identical numbers immediately
  after.

## Implementation order

1. `beatmapFormat.js`: export `RANKED_STATUSES`, move `matchesCollectionFilters` in. No behaviour
   change yet (osu.js still has its own copy). Verify: `npm run bench` unchanged (this file isn't
   in the scoring path, but confirms nothing broke the import graph).
2. `osu.js`: switch to the imported `RANKED_STATUSES`/`matchesCollectionFilters`, delete the local
   copies. Verify: `npm run bench` — expect `WRONG ARTIST` count unchanged (this only touches
   status filtering, not the artist gate); manually check one `status=ranked` search still returns
   results.
3. `src/lib/errors.js` (`toRouteError`) + wire into all three routes; add `isDemo` passthrough
   fixes (F-11) in the same commit since they touch the same three route files. Verify: static
   check that `isDemo` is present in each response shape, plus one live call to
   `/api/osu/player?q=<real username>` confirming the normal path still returns
   `type:'profile'` unchanged.
4. `osu.js`: cap `queriesToRun` to 4, cap route-level `extraQueries` to 3. Verify: `npm run
   bench:cost` stays <= 1.49/track (a `grep -c` on `bench/fixtures.json`'s `fallbacks` arrays
   first, to confirm none exceed 3 today, so the cap can't remove a case bench relies on).
5. `osu.js`: `artistProbeCache` LRU wrap. Verify: `npm run bench:cost` unchanged (55 calls,
   1.49/track) — this only bounds memory, not probe frequency.
6. `osu.js`: F-33 reorder + `titleOnly` flag. Then `SongRow.js`/`SongCardMobile.js` copy-condition
   change in the same commit (the flag is inert without the copy fix, and the copy fix references
   a flag that doesn't exist without step 6a — must land together). Verify: `npm run bench` —
   expect `correctAbstain` to drop and `hit` or a new distinguishable salvage count to rise
   (record the exact before/after numbers when implemented; if `WRONG ARTIST` rises above 0,
   revert — that is the one metric this workstream must never move).
7. `osu.js`: F-29 early-exit gate (requires `scoreBeatmapMatch` return-shape change) +
   `bench/scorers/shipped.mjs` destructure update. Verify: `npm run bench` — expect all six
   scorer blocks' numbers unchanged except possibly `matrix`/`SHIPPED` `hit` count (should not
   decrease); `npm run bench:cost` should not regress past 1.49/track (the gate can only add more
   loop iterations in the already-rare case a non-structured leading candidate hit 150 early, so a
   small increase is acceptable — state the new number, don't just assert it's fine).
8. `src/lib/searchRequest.js` (`buildSearchRequest`) + rewire `searchTargetSongs`. Pure refactor,
   same request shape. Verify: browser check — playlist import still fills the table with matches
   identically (spot-check 3 rows).
9. `handleManualSearch` rewrite (F-05) using the same `buildSearchRequest`. Verify: browser check
   — edit a row's query text to a different artist's song title, confirm the result now reflects
   the edited artist (not the stale row artist) and a wrong-artist edit gets flagged
   `artistOverride` instead of silently auto-selecting.
10. `src/lib/song.js` (`makeSong`/`songKey`/`mergeSongs`) + `beatmapToSong` rewrite + `page.js`
    inline `mergeSongs` deletion. Verify: browser check — both playlist import and player-section
    "select best/most played/favourites" flows still populate identical-looking rows; select-all
    and download still work from a player section.
11. F-10 (`total`/`fetched` split) + F-12 (local re-filter, `getUserBeatmapCollection` response
    shape change) together, since F-12's response shape is exactly what F-10's `fetched` field
    reads. Verify: browser check — open a player's Best section, switch the mode tab; most_played/
    favourite counts must not flicker to 0 and must not trigger a new network request (check
    browser devtools Network tab); Best does refetch on mode change. Header shows "N of TOTAL"
    when the two differ.
12. F-13 (request-generation guard) in `loadSection`. Verify: browser check — rapidly click
    between two player sections opening/closing; confirm no stale "N of TOTAL" or wrong-section
    beatmap flash (hard to script; manual click-through, note result in the commit message).
13. F-22 (`userId` validation) + F-31 (error-mapper reuse in the beatmaps route, already partly
    done in step 3 — this step is just the `userId` regex). Verify: `curl` with a malformed
    userId returns 400, not a raw osu.ppy.sh error.
14. F-37 (`downloadUrl` deletion). Verify: grep confirms zero remaining references anywhere
    (`src/`, `bench/`) before deleting; browser check that beatmap cards still render (they don't
    use this field to begin with, per the grep already run this session).
15. F-48 (playlist-append toast). Verify: browser check — import a playlist, confirm a toast
    reading "Added N songs" appears once.
16. User-Agent header addition across `osu.js` outbound fetches. Verify: one live call to
    `/api/osu/search?q=test`, confirm 200 (proves the header didn't get rejected by any WAF/
    origin — osu!'s API doesn't require one, this is purely politeness per the RULES section).

Each step above is one commit; each has its own verification, so a broken step is bisectable
without re-running the whole suite.

## Risks

- **`scoreBeatmapMatch`'s return-shape change (step 7)** endangers contract (5), the bench
  baseline. Mitigation: `bench/scorers/shipped.mjs` updated in the same commit; `npm run bench`
  run immediately after with the six-block output pasted into the commit message; any regression
  in `hit`/`correctAbstain`/`WRONG ARTIST`/`miss`/`unreachable` reverts the commit rather than
  being patched forward.
- **F-33's reorder (step 6)** endangers contract (3), "never auto-selected." Mitigation: `titleOnly`
  results still carry `matchScore: null` and both auto-select guards (`searchTargetSongs` and
  `handleManualSearch`) are updated together in the same commit — missing either would silently
  auto-select a title-only guess, the exact failure this workstream exists to prevent.
- **F-12's response-shape change to `getUserBeatmapCollection`** endangers contract (8), "filters
  after the fetch." Mitigation: filters still apply after the fetch, only the layer moves (osu.js
  to client) for two of three types; "one window, one call" is untouched. Bench doesn't cover
  collections, so verification here is browser-only by necessity.
- **`buildSearchRequest` unifying manual search with the playlist path** endangers contract (2),
  `source` populated on every path. Mitigation: manual search's `source` becomes the deliberate
  value `'query'`, never left blank or inherited from the row's stale platform tag.
- **Moving `matchesCollectionFilters`** touches a shared file other workstreams may also edit.
  Mitigation: its own small first commit (step 1), reviewable before any behavior lands on top.
- **User-Agent header addition** touches the token-fetch call; a typo there breaks every
  osu!-backed feature at once. Mitigation: last in the implementation order, verified live, and
  reads `getOsuAccessToken`'s current header block first rather than assuming its shape.

## Verification

Commands to run once implementation lands (in addition to the per-step checks above):

```bash
npm run bench          # expect: SHIPPED (src) hit 31, correctAbstain 6 or lower (F-33 may
                        # convert some of the 6 into a salvaged titleOnly result -- record
                        # the new number, do not assume it drops), WRONG ARTIST 0, miss 0,
                        # unreachable 0, correct maps offered >= 752
npm run bench:cost     # expect: SHIPPED (src) total calls <= 55, per track <= 1.49
```

```bash
# static / read-only, no server needed
grep -rn "downloadUrl" src/ bench/                 # expect: zero matches after step 14
grep -rn "RANKED_AND_LOVED\|RANKED_STATUSES" src/   # expect: one definition site only,
                                                     # in beatmapFormat.js, after step 2
node -e "const {strictnessProfile}=require('./src/lib/matchStrictness.js'); \
  console.log(strictnessProfile(50))"               # expect: unchanged, confirms contract (4)
                                                     # was never touched by this workstream
```

```bash
# one live call, within the 3-call budget (0 of 3 spent during planning; reasoning in
# "Owned findings deliberately NOT fixed" above made an empirical check unnecessary for
# the status-set question, so all 3 remain available to whoever implements this)
curl -s "http://localhost:3000/api/osu/player?q=<a real osu! username>" | head -c 300
# expect: {"type":"profile","user":{...}} -- confirms the isDemo-path change (step 3)
# didn't disturb the normal, credentialed path
```

Browser checks (manual, phone-width and desktop, per contract (10)):
- Playlist import: rows populate, auto-select behaves identically to before.
- Manual search edit: editing a row's text to a different song/artist changes the match and
  correctly flags a wrong-artist result instead of silently accepting it.
- Player profile with no `.env.local` credentials (temporarily unset, then restore): search and
  section-load both show the existing demo/setup-guide UI, never a raw error or blank page.
- Player sections: open Best + Most Played, switch mode tabs — Best reloads (Network tab shows a
  request), Most Played does not, and both show correct, non-flickering counts.

## Cost impact

**osu! API calls** (measured by `npm run bench:cost`, which is the authoritative number for the
matching path; player-section calls aren't covered by bench and are estimated):
- Search path: unchanged at the steady state (55 calls / 1.49 per track), possibly +1-2 calls in
  rare cases where the F-29 early-exit gate now runs one extra query iteration before locking in —
  bounded by `queriesToRun`'s new hard cap of 4, so the worst case per track goes from "however
  many fallbacks a playlist source supplied" (previously unbounded — F-14) to a firm ceiling of 4.
  This is a cost **decrease** in the worst case, roughly flat in the typical case.
- Player sections: **decrease**. Before, a mode or status change on an already-open section always
  re-fetched (up to 3 collection calls per switch: best/most_played/favourite). After, only `best`
  refetches on a mode change; a status-only change never refetches any section. For a user who
  toggles the status filter (Ranked & Loved vs All) once per session while browsing all three
  sections, this removes up to 3 calls per toggle with zero fewer features.

**Vercel function invocations**: no route is added or removed; `/api/osu/player`,
`/api/osu/player/beatmaps`, `/api/osu/search` keep their existing call frequency from the browser
except for the reduction above (fewer client-triggered refetches on mode/status changes means
fewer invocations of `/api/osu/player/beatmaps`, proportional to how often a user switches those
tabs after a section is already open).

**Origin transfer**: unaffected — the `limit=100` single-window-per-section fetch is unchanged;
this plan only changes what happens to the response *after* it's fetched, plus removes the
several extra fetches described above.

**Bundle size**: three new small files (`song.js`, `searchRequest.js`, `errors.js`), each under 50
lines, no new dependencies — negligible (well under 1KB gzipped combined). `page.js` never imports
`osu.js` today and still won't; `matchesCollectionFilters` moving to `beatmapFormat.js` (already
client-imported) is what lets the F-12 local re-filter call it without ever pulling osu.js's
server-only fetch/token code into the client bundle.
