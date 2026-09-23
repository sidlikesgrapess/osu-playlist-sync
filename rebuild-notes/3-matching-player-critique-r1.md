# Critique: matching-player (round 1)

## What I ran (commands and results)

| command / read | result |
|---|---|
| `npm run bench` (offline) | SHIPPED: hit 31, correctAbstain 6, WRONG ARTIST 0, miss 0, unreachable 0, correct maps offered 752, hard-rejected correct 22. Matches the contract 5 baseline exactly. |
| `npm run bench:cost` (offline) | SHIPPED: 47 title queries + 8 probes = 55 calls, 1.49 per track. baseline.mjs: 50 calls, 1.35 per track. Matches contract 5. |
| scratch `shape.mjs` (system temp, outside repo): wraps the shipped scorer so it returns `{score, verdict}` as plan F-29 proposes, replays every snapshot through the same accept logic `bench/pool.mjs` uses | 37 tracks; accepted with numeric return 31; accepted with object return **0**. Max captured queries per track 4; tracks with more than 4 queries 0. |
| Grep `scoreBeatmapMatch` callers | `src/lib/osu.js:743`, `src/lib/osu.js:775`, `bench/scorers/shipped.mjs:31`, `:39`, `bench/scorers/baseline.mjs:5` |
| Read `bench/pool.mjs` 46-127 | `replay()` iterates captured `snap.byQuery` buckets with its own early exit `if (best >= 150) break;` at :101 and numeric comparisons `s > best`, `s._score >= minScore`. It never calls `searchOsuBeatmaps`. |
| Read `src/lib/osu.js` 1-90, 120-294, 419-538, 671-865 | cited below |
| Read `src/app/page.js` owned ranges and the auto-select sites | cited below |
| Read all three `/api/osu/*` route files | cited below |
| Grep the other three phase 3 plans for `visibleItemsFor`, `titleOnly`, `toRouteError`, `User-Agent`, `http.js`, `UA_PROFILES` | client-ui plan: zero hits for `visibleItemsFor` / `titleOnly`; it extracts `MatchNotice` keyed on `artistOverride` only (`3-client-ui-plan-r1.md:38, 95, 134-135`). server-hardening plan: zero hits for `toRouteError`; it owns `src/lib/http.js` with `UA_PROFILES` and `fetchWithLimits` (`3-server-hardening-plan-r1.md:43-54, 117`). |
| Live osu! calls | 0 of 3 used. Mirror requests: 0 of 2 used. F-08 was already verified live in phase 2 (2-findings.md), so I did not spend a call re-proving it; the point below is that the *plan* spends zero calls to refute it. |

No source file was modified. No build was run. The dev server was not touched.

## Blocking

**B1. F-09 (high, owned) and the client half of X-05 are skipped entirely.**
The raw fetch at `src/lib/osu.js:722` only warns when `!res.ok`, so a 429 on every query variant pools nothing and the song is reported as `no-match`. Findings require routing it through `osuApiGet` (which attaches `.status`), surfacing a distinct error, and having the client treat `!res.ok || !data.success` as retryable (X-05). The plan's findings table has no F-09 row and no step touches the per-song search result handling in `page.js`. It only adds a UA to line 722 (plan :171). Rate-limited songs keep being misreported as "no beatmap exists".

**B2. F-08 (high, verified) is left unfixed on a premise that answers a different question.**
The plan argues `s=ranked` "already returns approved". The finding is that upstream `s=ranked` (`osu.js:719`) drops **loved and qualified**, which the client-side filter at `osu.js:739` (`isRankedStatus`) and the scorer bonus at `osu.js:526` both explicitly want. The plan uses zero of its live calls to check this, and it drops X-06's `upstreamStatusFor(filter)`. A loved-only song remains unreachable under the default filter.

**B3. F-11 / X-04 demo fix crashes the client instead of showing the setup guide.**
The plan returns `{ type: 'profile', user: null, isDemo: true }`. `handlePlayerSearch` does `if (data.type === 'profile') { applyPlayerProfile(data.user); return; }` (page.js:141-180). `applyPlayerProfile` dereferences `profile.counts` (page.js:187-205), which throws a TypeError whose message ends up in the error UI. `handleSelectPlayer` (page.js:208-223) has the same path. Nothing in the client reads `isDemo` from any osu route, and the setup guide opens only from the Navbar button (page.js:891, 1099). Contract 7 says demo mode "never crashes". The plan needs the client branch on `isDemo` *before* touching `data.user`, and needs a way to open the guide from it.

**B4. F-13's single global generation counter strands sections in a permanent loading state.**
One `playerRequestGenRef`, incremented in every `loadSection`, with both post-fetch `setPlayerSections` calls guarded. Opening a second section while the first is in flight, or `reloadPlayerSections` looping over several open sections (page.js:300-322), bumps the counter, and every earlier response is discarded. Those sections keep `isLoading: true, loaded: false` because the flags are only cleared in the success branch (page.js:236-274, 261). `handleToggleSection` only loads when `!section.loaded && !section.isLoading` (page.js:285-297), so they can never be retried. The generation must be keyed per (userId, type) and the finding's AbortController is also missing.

**B5. F-33 tags salvage results `titleOnly` instead of `artistOverride`, so they get auto-selected.**
Plan :187-188 says "tag the salvage results `titleOnly: true` instead of `artistOverride: true`". Every auto-select guard keys on `artistOverride` only: page.js:477, 607, 689. The Changes-by-file section does not update `searchTargetSongs` or the other two guards; only the Risks section (:338) claims it does. A title-only guess under `none` trust would be auto-selected and could slip into a bulk download, violating contract 3 and D-01. The plan also contradicts itself: :72 says "alongside `artistOverride`", :187 says "instead of". Fix the general rule: one predicate (e.g. `isUnconfirmedMatch(m)`) used by all three guards, covering both flags.

**B6. F-29 changes `scoreBeatmapMatch`'s return type, which zeroes the bench and requires editing `bench/`.**
Scratch replay: an object return takes SHIPPED accepted results from 31 to **0** because `bench/pool.mjs` compares numerically. The plan updates only `bench/scorers/shipped.mjs` and does not mention `bench/scorers/baseline.mjs:5`. Editing `bench/` is outside this workstream and the bench exists to replay the *real* function unchanged. It is also unnecessary: `artistVerdict` is already exported (`osu.js:419`) and returns `{verdict, confidence, rung}`, so the caller that needs the verdict can call it directly and `scoreBeatmapMatch` keeps its number-or-`-Infinity` contract.

**B7. `toRouteError` returns `{status, body}` but the plan returns it straight from the route.**
Plan :83 defines `toRouteError(error, {notFoundMessage}) -> {status, body}`; plan :139, :153, :161 write `catch (error) { return toRouteError(error, ...) }`. A Next route handler must return a `Response`; returning a plain object throws at runtime on every error path of all three routes. It must return `NextResponse.json(body, { status })`, or the call sites must wrap it. As written this is unimplementable and turns every 404/429/500 into an unhandled failure.

**B8. `makeSong` drops `playerMeta` and `playerSection`, which removes visible player data.**
`beatmapToSong` sets both (page.js:34-46) and `PlayerSections.js:37` reads them to show pp, rank and playcount. The plan's `makeSong` field list omits both. Routing `beatmapToSong` through it silently removes that column: feature loss against contract 1, and it breaks the "both paths identical via `beatmapToSong`" rule (contract 2) by forcing the adapter to bypass the helper.

**B9. The new `mergeSongs` inverts the collision rule and drops `position`.**
Current code keeps existing entries (`additions = incoming.filter(s => !seen.has(s.id))`, page.js:226-233) and assigns `position`. The plan's version is described as "Same external behaviour... incoming replaces existing on a collision", which is not the same behaviour: re-loading a section would overwrite a row the user already searched, matched or selected, wiping `matchedBeatmap` / selection state. `position` is read by `SongRow.js:77` and `SongCardMobile.js:80` and is not in the plan's shape.

**B10. F-12 is underspecified in ways that break the player path.**
(a) It moves mode/status filtering after dedupe for `most_played`, directly against `osu.js:285-286` ("Dedupe after filtering: the mode filter reads per-difficulty modes, which a merged entry would blur together"). (b) The `visibleItemsFor` wiring is handed to client-ui, whose plan has zero references to it. (c) The plan stops `reloadPlayerSections` clearing `most_played`/`favourite` but says nothing about the `setSongs([])` at page.js:300-322; if songs are cleared without reloading, selection and download from those sections point at nothing. (d) The signature returns `NormalizedEntry[]` while `allItems` holds songs. (e) The finding's debounce on the mode control is missing.

**B11. Step 15 (F-48) adds a toast that already exists.**
page.js:383-390 already calls `pushToast('Added to queue bottom', '${n} songs from X · N in queue', 'queue')`. Adding "Added N songs" would fire two toasts per append. It also lands in `handleFetchPlaylist` (page.js:334-407), which server-hardening owns.

**B12. The verification plan cannot detect failure for F-29, F-14 or F-33.**
The plan expects `npm run bench` to "reflect" F-29, F-33 and F-14. `bench/pool.mjs replay()` (46-127) replays captured buckets through its own loop with its own `best >= 150` early exit (:101) and never calls `searchOsuBeatmaps`. So the F-14 query cap, the F-33 salvage branch, the F-29 gate change and the UA header are all invisible to it; a broken implementation still reports hit 31. Each needs a check that actually executes the changed code, e.g. a `node --test` unit calling `searchOsuBeatmaps` with a stubbed `fetch` (no dependency needed, per CLAUDE.md).

## Non-blocking

- **F-30 diagnosis is inverted.** `osu.js:237` `RANKED_STATUSES` already has 4 statuses including `approved`; `beatmapFormat.js:35` `RANKED_AND_LOVED` has 3, used by `isRankedStatus` (:38) at `osu.js:739`. The fix outcome (one shared 4-status set in beatmapFormat) is right, but the plan's text says the opposite.
- **F-10 count is pre-dedupe.** `getUserBeatmapCollection` returns `fetched: normalized.length` (osu.js:266 region), which is before dedupe (e.g. 100), not the 88 rows shown, so the findings check "88 of 469" for peppy would not appear. Use the post-dedupe length.
- **F-14 `slice(0,4)` drops `targetTitle`.** `queriesToRun` is `[artist+title, query, ...options.queries, targetTitle]` (osu.js:695-702); with 3 fallbacks the bare title, the best recall query, is the one cut. Harmless on bench (max 4 captured) but the cap should keep the title. The finding's string-length cap and dedupe are also missing.
- **User-Agent should reuse server-hardening's `UA_PROFILES`** (`3-server-hardening-plan-r1.md:43-54`, X-07) rather than a private `withUserAgent` in osu.js, and the `<owner>/<repo>` placeholder should be the known repo URL `https://github.com/sidlikesgrapess/osu-playlist-sync`.
- **`src/lib/errors.js` duplicates the shared-helper layer** server-hardening is building; coordinate so there is one error-to-response helper.
- **`source: 'osu-player'` is not in `PLATFORM_BADGE`** (spotify, apple, youtube, query). Document what badge renders and how `resolveArtistTrust` treats it (D-07 asks for this to be an explicit decision).
- **Ownership:** the `SongRow.js:228` / `SongCardMobile.js:223` copy edits belong to client-ui, which is replacing exactly those lines with `MatchNotice` keyed on `artistOverride` only (`3-client-ui-plan-r1.md:38, 95, 134-135`); a `titleOnly` sibling branch will conflict. The PlayerSections range is stated as 355-403, the owned range is 370-400. `pushToast` is at page.js:731, inside the owned range, not outside it as stated.
- **`userId` path segment** at osu.js:272 is interpolated unencoded; the plan's verification does not run the findings' `userId=1%2F..%2Fx` or `peppy` checks, and uses a placeholder username.
- **Client-side `cleanSongTitle`** (via `buildSearchRequest`) adds titleCleaner to the client bundle; note the size.
- F-39 LRU (cap 200, 30 min TTL, short TTL for null failures) is fine.
- Any new copy (e.g. "Closest title match:") must avoid dashes as punctuation.

## Verdict

**Revise.** The bench baseline holds today (hit 31, cost 55 / 1.49), but the plan as written would break it (B6), would auto-select unconfirmed matches (B5), would crash demo mode (B3), strands player sections (B4), ships an unimplementable error helper (B7), loses player metadata and merge semantics (B8, B9), and skips two high findings (B1, B2). Its verification would not catch most of this (B12).

```json
{
  "verdict": "revise",
  "blocking": [
    "B1: F-09 (429 swallowed at osu.js:722 and shown as no-match) and client half of X-05 are skipped",
    "B2: F-08 left unfixed on a wrong premise; s=ranked at osu.js:719 drops loved/qualified, not approved; X-06 upstreamStatusFor missing",
    "B3: demo response {type:'profile',user:null,isDemo:true} makes applyPlayerProfile(null) throw at page.js:187-205; no client code reads isDemo or opens the setup guide",
    "B4: single global playerRequestGenRef discards concurrent section loads; sections stay isLoading:true and handleToggleSection (page.js:285-297) never retries; needs per (userId,type) key plus AbortController",
    "B5: F-33 tags salvage titleOnly instead of artistOverride; auto-select guards at page.js:477/607/689 check artistOverride only, so title-only guesses get auto-selected into bulk downloads",
    "B6: F-29 object return from scoreBeatmapMatch drops bench SHIPPED hits 31 to 0 (scratch replay), breaks baseline.mjs:5, requires editing bench/; use exported artistVerdict (osu.js:419) instead",
    "B7: toRouteError returns {status, body} but routes return it directly; Next handlers need a Response, so every error path fails",
    "B8: makeSong omits playerMeta/playerSection used by PlayerSections.js:37 (pp, rank, playcount lost)",
    "B9: mergeSongs inverted (incoming replaces; current existing wins, page.js:226-233) and drops position read by SongRow.js:77 / SongCardMobile.js:80",
    "B10: F-12 filters after dedupe against osu.js:285-286, visibleItemsFor unowned by client-ui, silent on setSongs([]) in reloadPlayerSections, wrong return type, no debounce",
    "B11: F-48 toast already exists at page.js:383-390; step 15 duplicates it inside server-hardening's range",
    "B12: verification relies on bench, which replays buckets via pool.mjs:101 and never calls searchOsuBeatmaps, so F-14/F-29/F-33/UA failures are undetectable"
  ],
  "nonBlocking": [
    "F-30 diagnosis inverted: osu.js:237 has 4 statuses, beatmapFormat.js:35 has 3",
    "F-10 N uses pre-dedupe fetched count, so '88 of 469' will not appear",
    "F-14 slice(0,4) drops targetTitle (osu.js:695-702); length cap and dedupe missing",
    "UA should use server-hardening UA_PROFILES and the real repo URL, not a private withUserAgent with <owner>/<repo>",
    "errors.js duplicates server-hardening's shared helper layer",
    "source 'osu-player' not in PLATFORM_BADGE; trust handling undocumented (D-07)",
    "SongRow/SongCardMobile edits conflict with client-ui MatchNotice extraction; PlayerSections range and pushToast location misstated",
    "verification skips peppy and userId=1%2F..%2Fx checks; osu.js:272 userId unencoded",
    "client-side cleanSongTitle adds bundle weight",
    "new copy must avoid dashes as punctuation"
  ]
}
```
