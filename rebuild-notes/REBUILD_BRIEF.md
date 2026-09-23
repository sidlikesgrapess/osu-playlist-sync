# Rebuild brief

Copied verbatim from REBUILD_PROMPTS.md (Session 1 prompt) so session 2 does not need it repeated. Read with REBUILD_PLAN.md.

## Why this is happening

The app has grown function heavy, with duplicated logic, unnecessary hops and loopholes.
The trigger was an incident on 2026-09-23: Vercel Hobby "Fast Origin Transfer" hit
10.24 GB of its 10 GB allowance because /api/download streamed every .osz through a
serverless function. Commits adda30a and d2ef793 moved downloads to fetches made directly
from the browser (catboy.best and nerinyan, both of which send `Access-Control-Allow-Origin: *`).
The proxy stays as a fallback capped at 5 per batch, and the fetches now have stall timeouts.

Still open, and must be covered:
- /api/download can be called by anyone and still streams bytes. The 5 per batch cap is
  enforced only in the client.
- The proxy retries catboy and nerinyan, which the browser already tried.
- When every mirror fails, the proxy returns a synthetic placeholder .osz with status 200,
  and the client counts it as a success.
- `downloadUrl` in src/lib/osu.js still points at the proxy.
- ZIP bundles are built entirely in memory (JSZip in page.js).

Mirror facts measured on 2026-09-23:
- catboy.best: returns 403 to any request without an identifying User-Agent (browsers
  are fine). It served about 2 MB/s.
- nerinyan: redirects (302) to S3. The S3 response echoes the request origin in its CORS
  header, including "null". It was slow, about 40 KB/s, at one point.
- beatconnect: pins its CORS header to another site, so the browser cannot read it.
- sayobot: did not respond.

## Contracts the rebuild must keep

1. **Features.** Every user-facing feature on main survives. The Phase 0 map is the
   checklist.
2. **Song object.** The song object contract from CLAUDE.md, or a documented successor.
   `source` is populated on every path, and `beatmapToSong` keeps both entry paths identical.
3. **Artist gate semantics:**
   - The artist is a gate, never a weight. A confident `DIFFERENT` verdict returns `-Infinity`.
   - Artist trust is decided by the alias set, never by a row count.
   - Rejection reasons are kept.
   - A result flagged `artistOverride` is shown with its notice and never auto-selected.
4. **Strictness curve.** Changes happen only in matchStrictness.js, and 50 must still map
   to floor 0.50 / cutoff 70.
5. **Bench parity.** `npm run bench` must not regress any metric of the `shipped` scorer.
6. **Extraction.** Spotify, Apple Music and YouTube extraction keep working with zero API keys.
7. **Demo mode.** Without osu! credentials the app returns `{ isDemo: true }` and never
   crashes.
8. **osu! API budget.** Keep the token cache. Fetch one window and paginate locally. Apply
   collection filters after the fetch.
9. **Downloads.** In the normal path, file bytes never pass through a Vercel function.
   Any fallback that does must be capped on the server, and must never report a
   placeholder as a real download.
10. **Desktop and mobile.** Both work, with no horizontal scroll at phone width.

## Rules
- **Evidence or it does not count.** Every finding cites file:line. Label speculative
  findings as speculative. Critics try to disprove, not to agree.
- **Fix the general rule.** Never add the specific case to a list.
- **User-facing copy** never uses a dash as punctuation.
- **Never run `npm run build`** while `npm run dev` is running.
- **Keep live osu! API calls minimal.** `npm run bench:capture` is off limits.
- **Do not delete or weaken `bench/`.**
- **Keep external traffic polite.** Keep request pacing to mirrors, and send a proper
  User-Agent from the server.
