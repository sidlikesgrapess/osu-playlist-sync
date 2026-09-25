# Phase 4 code review (main...rebuild, medium)

| # | finding | verdict | fix |
|---|---|---|---|
| 1 | Player search, profile load, Clear player and non-append playlist load drop the list without cancelling a running batch (page.js handleClearPlayer, applyPlayerProfile, handleFetchPlaylist, handlePlayerSearch) | CONFIRMED | a277ec4: one `dropSongList` helper on every list-replacing path |
| 2 | 429 auto retry clamps Retry-After to 15 s and retries anyway; against the 60 s fixed window (search/route.js:11) that retry is a certain 429. Contradicts the comment above RATE_LIMIT_RETRY_WAIT_CAP_S | CONFIRMED | a277ec4: skip the auto retry when Retry-After exceeds the cap; the row keeps Retry |
| 3 | failedSearchState sets hasSearched: true, so Search All, its count and the match rate treat failed rows as answered | CONFIRMED | a277ec4: `awaitsAnswer` for Search All; counts exclude searchError rows. Paging still only searches never-tried rows, so no hammering |
| 4 | rateLimit.js buckets Map never evicted | CONFIRMED, low | ac574d7: sweep expired windows past 5000 keys, with a test |
| 5a | http.js non-ok response body left unread | CONFIRMED, low | 98fb20f: `res.body?.cancel()` |
| 5b | http.js abort listener never removed | REFUTED | no server caller passes a `signal` (grep src/lib src/app/api), so no long-lived signal accumulates listeners |

After: npm test 165 / 164 pass / 0 fail / 1 todo (F-28). npm run bench identical to bench-main.txt (bench-after-review.txt); cost 55 calls, 1.49 per track. Dev on :3000 answers 200.
