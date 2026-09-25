# Audit: matching-api

Traces the matching pipeline from user actions (search all, strictness slider, mode/status filters, manual search) through /api/osu/search, src/lib/osu.js scoring and artist-trust logic, to the UI rejection display. Work in progress, appended incrementally.

## Baseline

`npm run bench` (2026-09-22 snapshot, 37 fixtures, threshold 70), shipped scorer row, run verbatim
this session:

```
── SHIPPED (src) ─────────────────────────────
  hit              31  83.8%   correct beatmap, artist confirmed
  correctAbstain    6  16.2%   returned nothing, and nothing was right
  WRONG ARTIST      0  0.0%   <- the failure that matters
  miss              0  0.0%   right answer was in the pool, we returned nothing
  unreachable       0  0.0%   right answer never came back from the API
  unlabelled        0  0.0%   needs a verdict in labels.json
  ---
  correct maps offered   752   confirmed-artist mapsets the user can actually pick
  hard-rejected correct   22   confirmed-artist mapsets made invisible by the gate
```

`npm run bench:cost` (same fixture set, 37 tracks / 28 distinct artists, 1.32 tracks per artist),
shipped scorer row, run verbatim this session:

```
scorer                title q  probes   total  per track
SHIPPED (src)              47       8      55       1.49
```

These two blocks are the parity baseline: any change to `scoreBeatmapMatch`/`resolveArtistTrust`
must be re-measured against them before landing.

Contract spot-checks run this session:
- `node` one-liner importing `strictnessProfile` from `src/lib/matchStrictness.js`:
  `strictnessProfile(50)` → `{"titleFloor":0.5,"minScore":70,"maxArtistRung":6,"salvageFloor":0.92}`
  — matches the CLAUDE.md contract exactly (floor 0.50 / cutoff 70).
- `node` one-liner importing `src/lib/osu.js` with `OSU_CLIENT_ID`/`OSU_CLIENT_SECRET` unset:
  `getOsuAccessToken()` → `null`, and `searchOsuBeatmaps(...)` →
  `{"beatmapsets":[],"total":0,"isDemo":true}` — the demo-mode contract holds, verified by
  execution, not just reading.


### MAT-01 Manual search sends no artist, so the artist gate never runs

```json
{ "id": "MAT-01", "area": "matching-api", "dimension": "correctness", "title": "handleManualSearch bypasses the artist gate entirely, so a wrong-artist result can auto-select into a bulk download", "file": "src/app/page.js", "line": 676, "severity": "critical", "evidence": "handleManualSearch (src/app/page.js:676-681) builds queryParams with only q, mode, status, strictness — no artist, title or source, unlike searchTargetSongs (page.js:450-458) which sends all three. In src/app/api/osu/search/route.js:11 `artist = searchParams.get('artist') || ''` is then '', and in searchOsuBeatmaps (src/lib/osu.js:679, 503) `targetArtist` is '' so the whole `if (targetArtist) { ... }` artist-scoring/gate block (osu.js:503-524) is skipped outright — scoreBeatmapMatch never calls artistVerdict and can never return -Infinity for this call. Consequently the result never carries `artistOverride` (that flag is only set in the empty-formatted branch, osu.js:842, which requires an artist to have been gated). Back in page.js:689, `if (matched && !matched.artistOverride) setSelectedIds(...)` — since artistOverride is always falsy here, ANY top-scoring title match auto-selects, artist unchecked.", "reproduction": "Live call, dev server: GET /api/osu/search?q=Faded&mode=all&status=any&strictness=50 (no artist/title/source — mirrors handleManualSearch's params). Response: total 48, bestScore 124.76, rejection null, artistConfidence 'none', top match {artist:'Alan Walker', title:'Faded', artistOverride: undefined, matchScore: 124.76}. Because artistOverride is undefined, page.js's `!matched.artistOverride` check is true and this row would auto-select — for any typed query, not just this one, since no artist was ever compared.", "confidence": "verified" }
```
Fix direction: manual search should thread the song's known artist/title/source through like every other search path (or explicitly re-derive them from the edited query), not special-case itself out of the same gate the rest of the pipeline enforces.

### MAT-02 status=ranked asks osu! for literal-ranked only, silently dropping Loved/Qualified from the "Ranked & Loved" filter

```json
{ "id": "MAT-02", "area": "matching-api", "dimension": "correctness", "title": "The server-side ranked status filter only ever returns beatmapsets whose status is literally ranked, never loved or qualified, contradicting the app's own Ranked & Loved semantics", "file": "src/lib/osu.js", "line": 719, "severity": "high", "evidence": "searchOsuBeatmaps builds s=${isRankedOnly ? 'ranked' : 'any'} (osu.js:719) and passes it straight to osu!'s own /beatmapsets/search status parameter, then separately does sets = sets.filter(bm => isRankedStatus(bm.status)) (osu.js:738-739) using RANKED_AND_LOVED = ['ranked','loved','qualified'] (beatmapFormat.js:35). But osu!'s s= parameter is itself a status restriction, not a hint -- the app's own local filter after it is a no-op whenever the upstream one already excluded everything but literal ranked.", "reproduction": "Live call, dev server: GET /api/osu/search?q=nightcore&title=nightcore&mode=all&status=ranked&strictness=0 -> total 49, statuses seen: [\"ranked\"] -- every one of 49 results across a broad, popular query came back status:ranked; not one loved or qualified set was present despite them existing on osu! for popular queries at strictness 0 (which admits everything). This confirms the upstream query itself, not the local filter, is what's actually restricting results.", "confidence": "verified" }
```
Fix direction: for the "Ranked & Loved" filter, either drop the upstream s=ranked restriction and rely solely on the local isRankedStatus filter, or query osu! per accepted status and merge -- the upstream parameter and the local filter must agree on what "ranked" means, the same requirement RANKED_AND_LOVED's own comment already states.

### MAT-03 429s and other upstream failures are swallowed and reported as a confident, empty no-match instead of surfacing the error

```json
{ "id": "MAT-03", "area": "matching-api", "dimension": "correctness", "title": "A rate-limited or failing osu! API call bleeds into a 200 success response with rejection no-match, indistinguishable from a genuinely absent beatmap", "file": "src/lib/osu.js", "line": 730, "severity": "high", "evidence": "The per-query fetch in searchOsuBeatmaps (osu.js:722-732) is a raw fetch(...), not the shared osuApiGet helper (osu.js:65-82) that CLAUDE.md says callers rely on for .status to distinguish 429 from 404. On !res.ok it only does console.warn(...) (osu.js:731) and falls through to the next query in queriesToRun -- no throw, no retry, no backoff, .status never leaves this function. If every query variant 429s, allFoundSets stays empty and the function returns beatmapsets: [] with rejection: { kind: 'no-match' } (osu.js:847-857), no indication anywhere in the payload that the upstream call failed rather than genuinely finding nothing. route.js:53-64 forwards this as success: true with HTTP 200. In page.js:471-490 and 686-703, the client only branches on result.beatmapsets/result.rejection -- there is no result.success or HTTP-status check at all, so a genuine 500 from route.js's catch block (route.js:67-70, an {error:...} body with no beatmapsets key) renders identically to a confident no-match too.", "reproduction": "n/a (traced; deliberately did not spend the live osu!/mirror budget forcing a real 429, per the area's call budget)", "confidence": "traced" }
```
Fix direction: propagate a distinct rejection kind or a top-level retryable flag when every query variant failed with a non-2xx status, so the UI can say osu! is rate limited, try again instead of implying the song isn't mapped -- and check result.success/HTTP status in the client before treating a response as a real match result.

### MAT-04 An artist-unknown verdict hides salvageable title matches that wrong-artist/artist-absent would show

```json
{ "id": "MAT-04", "area": "matching-api", "dimension": "correctness", "title": "When artist trust resolves to none, near-title-match candidates are never salvaged into the result even though the wrong-artist and artist-absent branches immediately below do exactly that", "file": "src/lib/osu.js", "line": 823, "severity": "high", "evidence": "In the formatted.length === 0 branch (osu.js:801-849), titleMatches is computed first from [...gatedOut, ...allFoundSets] filtered by titleSimilarity(...) >= strict.salvageFloor (osu.js:811-812) -- this runs unconditionally, before the artistConfidence check. But the very next if (osu.js:823) is if (artistConfidence === 'none' && targetArtist) { rejection = { kind: 'artist-unknown', artist: targetArtist }; } with no linking to the titleMatches.length > 0 branch that follows it (osu.js:825-843) -- so when confidence is none, the function returns with results = formatted (still [], set at osu.js:802) even if titleMatches is non-empty. Only when confidence is NOT none does a non-empty titleMatches populate results with artistOverride: true candidates (osu.js:839-843). The CLAUDE.md contract and this file's own comments (osu.js:798-800, 830-833) say hiding a title-matched candidate helps nobody -- that principle is honored for wrong-artist/artist-absent but not for artist-unknown.", "reproduction": "n/a (traced from the branch order at osu.js:801-849; constructing a live fixture that lands exactly on artistConfidence:'none' with a non-empty titleMatches pool was not attempted, to stay inside the live-call budget)", "confidence": "traced" }
```
Fix direction: check titleMatches.length > 0 before, or independent of, the artistConfidence === 'none' branch, so an unverifiable artist string still shows its best title-similar candidate, flagged, exactly like the other two rejection kinds.

### MAT-05 The score >= 150 early exit can end the query loop before low-confidence artist trust is resolved

```json
{ "id": "MAT-05", "area": "matching-api", "dimension": "correctness", "title": "Early-exit at bestScore >= 150 is reachable via an unverified low-confidence artist credit, and once it fires no further query variants run, shrinking the pool the later trust rescore depends on", "file": "src/lib/osu.js", "line": 757, "severity": "medium", "evidence": "For any non-structured source, artistConfidence starts as low (osu.js:691) and scoreBeatmapMatch (osu.js:490-535) still adds +100/+30 for a SAME/WEAK verdict even at low confidence -- only a DIFFERENT verdict is treated specially, and even then it's -40 doubt, not a gate, at low confidence (osu.js:512-523). A title-exact set that merely token-matches the artist string can reach 160*1-60=100, +100 artist, +15 ranked, +~5 popularity, comfortably over the 150 break at osu.js:757, ending queriesToRun after only the first query variant. The real trust resolution (verifyLowConfidenceArtist, osu.js:767-782) runs only after the loop, over whatever [...allFoundSets, ...gatedOut] happened to accumulate by then -- so if the true best candidate would only have surfaced from a later query variant (title synonym / fallback query), that variant is never run, and there is nothing for the alias derivation (aliasesFromSets, osu.js:551-567) or the rescore to work with.", "reproduction": "n/a (traced through osu.js:678-782; the interaction requires a specific fixture -- first query variant scoring >=150 on an unverified artist while a better or only-correct candidate lives behind a later query variant -- that bench's 37 fixtures don't necessarily hit today, so this is a latent risk rather than a currently observed miss)", "confidence": "traced" }
```
Fix direction: gate the early exit on the same confidence bar the final score uses (don't early-exit purely on a low-confidence artist credit), or resolve artist trust before deciding whether to stop querying rather than after.

### MAT-06 The fallbacks query list has no size cap, so one request can trigger arbitrarily many upstream osu! calls against the single shared token

```json
{ "id": "MAT-06", "area": "matching-api", "dimension": "cost-quota", "title": "route.js JSON-parses an unbounded fallbacks array straight into the per-query fetch loop, with no length cap anywhere between the request and the upstream osu! call", "file": "src/app/api/osu/search/route.js", "line": 33, "severity": "high", "evidence": "route.js:33-40 does JSON.parse(fallbacksParam) and, if it is an array, spreads every element into extraQueries with no Array.length check. That flows into searchOsuBeatmaps(query||title, {..., queries: extraQueries, ...}) (route.js:43-51), which builds queriesToRun as a Set (osu.js, dedup only, not size-limited) from artist+title, query, every entry in options.queries, and title -- one iteration of the sequential for (const q of queriesToRun) loop (osu.js:722-732) issues one raw fetch to osu!'s /beatmapsets/search per entry, all against the single cached app token (getOsuAccessToken, osu.js:1-64). The normal client caller (page.js:460-466) dedupes and sends only a song's own fallbacks/queries, but route.js itself enforces nothing -- a request built directly against /api/osu/search (not through page.js) with a fallbacks JSON array of, say, 200 distinct strings would issue roughly 200 sequential upstream calls in one HTTP request, all counted against the app-wide osu! rate limit CLAUDE.md already says is aggressive.", "reproduction": "n/a (traced from route.js:33-40 and the queriesToRun construction in osu.js; did not send an actual oversized fallbacks payload to the shared dev server, to avoid spending shared rate-limit budget on other auditors' sessions)", "confidence": "traced" }
```
Fix direction: cap the parsed fallbacks array to a small fixed length in route.js before it ever reaches searchOsuBeatmaps, the same place the JSON is parsed, so the limit holds regardless of caller.

### MAT-07 RANKED_STATUSES and RANKED_AND_LOVED disagree on 'approved', two different definitions of "ranked" in the same request lifecycle

```json
{ "id": "MAT-07", "area": "matching-api", "dimension": "duplication-dead-code", "title": "osu.js defines its own RANKED_STATUSES including approved for player-collection filtering, while beatmapFormat.js's RANKED_AND_LOVED (used by both searchOsuBeatmaps and the client's local narrowMatchesToRanked) excludes it, despite a comment on the latter insisting the two must never disagree", "file": "src/lib/osu.js", "line": 237, "severity": "medium", "evidence": "const RANKED_STATUSES = ['ranked', 'loved', 'qualified', 'approved']; (osu.js:237) is consumed only by matchesCollectionFilters (osu.js:244-246, grep-confirmed the only call site), which backs the osu! player's best/most-played/favourites collection endpoints -- a different area (player), not searchOsuBeatmaps. Meanwhile RANKED_AND_LOVED = ['ranked','loved','qualified'] (beatmapFormat.js:35) is imported and used by both searchOsuBeatmaps's local isRankedOnly filter (osu.js:738-739) and page.js's narrowMatchesToRanked (client-side re-filter on mode/status change). beatmapFormat.js:28-34's own comment says explicitly: 'If those two ever disagreed, narrowing the filter locally would keep a different set of beatmaps than refetching with it would' -- true only within matching-api's own two consumers, which do agree with each other; the actual disagreement is cross-area (matching-api's isRankedStatus vs the player area's RANKED_STATUSES), so a beatmapset with status approved is ranked for a player's collection view but not ranked for a song search, with no comment anywhere flagging that inconsistency to a future editor of either list.", "reproduction": "n/a (confirmed via Grep that RANKED_STATUSES has exactly one call site, matchesCollectionFilters, and that isRankedStatus/RANKED_AND_LOVED is what both searchOsuBeatmaps and narrowMatchesToRanked actually use -- no live call needed)", "confidence": "verified" }
```
Fix direction: name the two lists to reflect what actually differs (e.g. a collections-specific list vs a search-specific list) with a comment cross-referencing the other, or, if approved should count as ranked everywhere, reconcile them into one shared constant.

### MAT-08 downloadUrl is built on every formatted beatmapset and never read anywhere in src/

```json
{ "id": "MAT-08", "area": "matching-api", "dimension": "duplication-dead-code", "title": "formatBeatmapset always sets a downloadUrl field pointing at /api/download, but nothing in src/ ever reads beatmapset.downloadUrl", "file": "src/lib/osu.js", "line": 905, "severity": "low", "evidence": "formatBeatmapset (osu.js:863-907) sets downloadUrl: `/api/download?beatmapsetId=${set.id}` (osu.js:905) on every candidate returned from searchOsuBeatmaps, for every song, every search. Grep for downloadUrl across src/ turns up only this write site and no read site -- the actual download flow (per CLAUDE.md's Downloads section) drives /api/download from the beatmapset id kept elsewhere in the song/selection state, not from this field. It is computed and shipped over the wire on every single match, for no consumer.", "reproduction": "n/a (confirmed via Grep for `downloadUrl` across src/ -- one write site, zero reads)", "confidence": "verified" }
```
Fix direction: drop the field from formatBeatmapset, or if a future consumer is planned, add it now rather than shipping unread bytes on every response.

### MAT-09 artistProbeCache is an unbounded, process-lifetime Map with no eviction

```json
{ "id": "MAT-09", "area": "matching-api", "dimension": "memory-resource-leaks", "title": "The artist-probe memoization cache grows forever for the life of the warm serverless instance, with no size cap, no TTL and no eviction of any kind", "file": "src/lib/osu.js", "line": 539, "severity": "medium", "evidence": "const artistProbeCache = new Map(); (osu.js:539) is module-level, alongside the token cache CLAUDE.md documents as an intentional warm-instance singleton. probeOsuArtist checks artistProbeCache.has(key) first (osu.js:585) and, whether the probe succeeds or fails, always artistProbeCache.set(key, ...) (osu.js:600, 604) -- there is no maximum size check, no LRU eviction and no expiry timestamp anywhere in this function or file. Unlike the token cache (which holds exactly one entry, refreshed on a clear schedule), this cache adds one entry per distinct artist string ever probed, for the lifetime of the process, and a warm instance handling many distinct playlists over hours or days accumulates entries without bound.", "reproduction": "n/a (traced from osu.js:539-605; reproducing actual unbounded growth would require sustained probing across hundreds of distinct artist strings against the live dev server, outside the call budget for this audit)", "confidence": "traced" }
```
Fix direction: cap the map's size (evict oldest on insert past a threshold) or add a TTL alongside the existing null-caches-a-failure convention, so a long-lived instance can't grow this without bound.

### MAT-10 The query-variant loop fetches osu! sequentially, adding cumulative latency per track

```json
{ "id": "MAT-10", "area": "matching-api", "dimension": "network-hops-latency", "title": "searchOsuBeatmaps awaits each query variant's fetch one at a time instead of firing them concurrently, so a track needing multiple query variants pays their latencies serially", "file": "src/lib/osu.js", "line": 722, "severity": "low", "evidence": "for (const q of queriesToRun) { ... const res = await fetch(...); ... } (osu.js:722-732) awaits inside the loop body, so each query variant (artist+title, cleaned query, every fallback, bare title) only starts after the previous one's response has fully returned -- the bestScore >= 150 early exit (osu.js:757) mitigates this for easy matches by stopping after the first good hit, but for a track that never clears 150 (an obscure artist, a title that needs a later fallback to resolve), every variant in queriesToRun runs back-to-back rather than in parallel. bench/README.md's own measured cost table (20 tracks, concurrency 3) reports 279ms per track wall-clock with an average of 1.45 total calls per track -- most tracks only need one query, so this cost is currently masked by the early exit and low average call count, but it is a real per-track latency multiplier for the harder tracks the early exit doesn't catch.", "reproduction": "n/a (traced from the loop structure at osu.js:722-732; bench's own cost/latency numbers, cited above, corroborate the average call count without isolating the worst-case serial-fetch tracks specifically)", "confidence": "traced" }
```
Fix direction: fire the query variants with Promise.all (or a small internal concurrency limit) and take the first result that clears the early-exit score, rather than awaiting each one in sequence -- bench:cost and bench's latency numbers should be re-measured against this specific change before it ships, since it changes call ordering, not just call count.

### MAT-11 Every completed track search re-maps the entire songs array, making a large playlist's search fan-out O(n * m) instead of O(m)

```json
{ "id": "MAT-11", "area": "matching-api", "dimension": "rendering-performance", "title": "searchTargetSongs calls setSongs(prev => prev.map(...)) once per individual track's search completion, so a playlist of n songs with m targeted for search re-maps and re-renders the full n-length array m times", "file": "src/app/page.js", "line": 471, "severity": "medium", "evidence": "Inside searchNext() (page.js:445-499), each track's fetch resolves independently (concurrency 3 via the recursive searchNext() calls) and, on success, calls setSongs(prev => prev.map(s => ...)) (page.js:471) to update just that one song's row -- but prev.map walks every song currently in state, not just the m being searched. For a large playlist (say n=200) with Search All Remaining targeting m=200, this is 200 separate setSongs calls each mapping a 200-element array (40,000 element visits total) plus 200 React re-renders of whatever consumes songs, rather than batching completions and updating state once per batch or once at the end. The catch block (page.js:493) and the manual-search completion (page.js:686, confirmed via Grep) repeat the identical per-completion full-array-map pattern.", "reproduction": "n/a (traced from the setSongs call sites at page.js:471, 493, 686, 708 confirmed via Grep; verifying the actual re-render cost would require reading SongTable.js/profiling the rendered component tree, which is outside this area's file scope)", "confidence": "traced" }
```
Fix direction: accumulate completed results in a local (non-state) buffer inside searchNext and flush to setSongs on a small interval or once the whole batch settles, rather than on every single completion -- this is a client-ui-adjacent concern as much as a matching-api one, since the actual render cost lives in whatever component consumes songs.

## Dimensions with no findings

- **ui-glitch-parity** — the two row renderers this dimension would cover, `SongRow.js` and
  `SongCardMobile.js`, are out of this area's file scope (they belong to the `client-ui`
  area's own audit); nothing in the matching-api file set (`route.js`, `osu.js`,
  `matchStrictness.js`, `beatmapFormat.js`'s `describeRejection`, `page.js`'s search/filter
  handlers) renders a row itself, only produces the data and rejection reasons a row later
  reads.

## Summary

11 findings total.

- Critical: 1 (MAT-01)
- High: 4 (MAT-02, MAT-03, MAT-04, MAT-06)
- Medium: 4 (MAT-05, MAT-07, MAT-09, MAT-11)
- Low: 2 (MAT-08, MAT-10)

Top 3:
1. **MAT-01** (critical) — manual search sends no artist at all, so the artist gate the rest
   of the app relies on never runs for that path, and a wrong-artist result can auto-select
   straight into a bulk download.
2. **MAT-06** (high) — the fallbacks query list has no size cap between the request and the
   sequential upstream fetch loop, so one crafted request can multiply calls against the
   single shared osu! token.
3. **MAT-02** (high) — the server-side ranked-status filter asks osu! for literally
   status:ranked only, so "Ranked & Loved" silently never returns a Loved or Qualified
   beatmap regardless of what the local filter intends.

<!-- AUDIT COMPLETE -->
