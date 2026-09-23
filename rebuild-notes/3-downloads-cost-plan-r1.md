# Plan: downloads-cost (round 1)

Status: complete. Baseline commit for line numbers: bdc6990. Owned files: `src/app/api/download/route.js`,
`src/lib/beatmapDownload.js`, `src/components/StatsBar.js`, `src/components/DownloadToast.js`, new
`src/lib/filename.js` / `src/lib/archive.js` / `src/lib/mirrors.js`. Shared file: `src/app/page.js`
lines 21, 65-75, 736-860 only (per 2-findings.md Workstreams table). No source file was edited to
produce this plan; three read-only mirror HEAD/curl checks and `npm run bench`/`bench:cost` (offline)
were run, budgets now exhausted as instructed.

## Findings resolved

| id | severity | one-line fix |
|---|---|---|
| F-01 | high | validate `beatmapsetId` against `^[1-9]\d{0,9}$` in route.js before any mirror is contacted; 400 otherwise |
| F-03 | high | delete `generateFallbackOsz` and its JSZip import; total mirror failure returns a clean non-2xx JSON error |
| F-04 | high | one shared `isValidArchiveBlob`/`isValidArchiveChunk` (`src/lib/archive.js`) checks ZIP magic bytes on the CORS-mirror blob and the proxy blob alike, closing the gap where only the CORS path checked `MIN_ARCHIVE_BYTES` |
| F-15 | med | server mirror list becomes `beatconnect.io` + `sayobot` only (`src/lib/mirrors.js`), dropping catboy/nerinyan server-side; those two stay client-only CORS mirrors |
| X-07 | med | one `UA_PROFILES.mirror` string (consumed from server-hardening's `http.js`) replaces the ad hoc UA at route.js:108, applied to every mirror, not a catboy-only special case |
| F-16 | med | new `isBatchActive` prop disables both Download and ZIP buttons while either is running |
| F-17 | med | ZIP generation switches to `generateAsync({ type: 'blob', streamFiles: true })` plus a `MAX_ZIP_BYTES` running-size cap that stops adding files past budget; JSZip becomes a dynamic import |
| F-24 | low | dead `mirror` query param removed from route.js (no client ever sends it) |
| F-34 | low | `window.open` fallback target changes from a raw mirror URL to the beatmapset's own osu! page (`MIRROR_HOSTS`/`BEATMAPSET_PAGE` in `mirrors.js`), so it never points at a UA-sensitive direct-download endpoint |
| F-38 | low | one `sanitizeFilename`/`contentDisposition` pair (`src/lib/filename.js`) replaces the three separate ad hoc `.replace(/[\\/*?:"<>|]/g, '_')` call sites (route.js:130, page.js x2) and adds RFC 5987 `filename*=` |
| F-42 | low | `downloadBlob`'s `URL.revokeObjectURL(url)` moves into a `setTimeout(…, 1000)` so Firefox/Safari don't revoke before the download starts |
| F-43 | low | `fetchBlob` captures `res.status`; a 429 triggers one bounded backoff (`Retry-After` header or 2s) before giving up, instead of being indistinguishable from any other failure |
| F-44 | low | `AbortController` added to StatsBar via a new `onCancelBatch` prop + Cancel button, wired to a signal threaded through `fetchBeatmapArchive`/`fetchBlob` |
| X-11 | low | `MAX_PROXY_ARCHIVE_BYTES` enforced server-side while streaming (not just `Content-Length`), via server-hardening's `fetchWithLimits` |

All 13 owned findings plus X-11 get a fix in round 1; none are deferred. The ~400-line budget was
reachable without dropping anything because most fixes are small and several share one new module.

## Target design

Three new lib modules, each with a single job, plus edits to the three existing owned files.

**`src/lib/mirrors.js`** — the mirror registry, single source of truth for both fetch paths and CSP.
```js
export const CORS_MIRRORS = [
  { name: 'catboy.best', url: (id) => `https://catboy.best/d/${id}` },
  { name: 'nerinyan.moe', url: (id) => `https://api.nerinyan.moe/d/${id}` },
];
export const PROXY_ONLY_MIRRORS = [
  { name: 'beatconnect.io', url: (id) => `https://beatconnect.io/b/${id}` },
  { name: 'sayobot', url: (id) => `https://dl.sayobot.cn/beatmaps/download/full/${id}` },
];
export const MIRROR_HOSTS = ['catboy.best', 'api.nerinyan.moe', 'beatconnect.io', 'dl.sayobot.cn'];
export const beatmapsetPage = (id) => `https://osu.ppy.sh/beatmapsets/${id}`;
```
`beatmapDownload.js` imports `CORS_MIRRORS` from here instead of defining its own copy; `route.js`
imports `PROXY_ONLY_MIRRORS`; `page.js`'s F-34 fallback imports `beatmapsetPage`; server-hardening's
CSP work (F-25) consumes `MIRROR_HOSTS` instead of hardcoding hosts a second time.

**`src/lib/archive.js`** — the one archive-validity predicate, used identically on both blob and
stream shapes.
```js
export const MIN_ARCHIVE_BYTES = 10 * 1024;
export function hasZipMagic(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
export async function isValidArchiveBlob(blob) {
  if (!blob || blob.size < MIN_ARCHIVE_BYTES) return false;
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return hasZipMagic(head);
}
export function isValidArchiveChunk(firstChunk, contentLength) {
  if (contentLength != null && contentLength < MIN_ARCHIVE_BYTES) return false;
  return hasZipMagic(firstChunk);
}
```
Structural (magic bytes) over size-only, per the architect note. `MIN_ARCHIVE_BYTES` still earns a
place as a cheap pre-filter (a genuine .osz is never near this small) but never runs alone — magic
bytes are the real gate, size is just an early-exit. Both call sites (`beatmapDownload.js` CORS
branch and proxy branch; `route.js` before relaying) call the same function, closing F-04.

**`src/lib/filename.js`** — one sanitiser shared by the route and the client.
```js
export function sanitizeFilename(name, { fallback = 'beatmap', maxLength = 180 } = {}) {
  const cleaned = String(name || '').replace(/[\\/*?:"<>|\u0000-\u001f]/g, '_').trim();
  return (cleaned || fallback).slice(0, maxLength);
}
export function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
```

**What is deleted**: `generateFallbackOsz` (route.js:9-68) and its `JSZip` import in route.js; the
dead `mirror` query-param branch (route.js:84-94); the three inline `.replace(/[\\/*?:"<>|]/g, '_')`
sanitisers; `beatmapDownload.js`'s local `CORS_MIRRORS`/`MIN_ARCHIVE_BYTES` (moved, not duplicated).

## Changes by file

**`src/app/api/download/route.js`** (166 lines, fully owned)
- Delete `generateFallbackOsz` (lines 9-68) and the top-of-file `import JSZip from 'jszip'`.
- Line 73: after reading `beatmapsetId`, validate `/^[1-9]\d{0,9}$/`; on failure return
  `NextResponse.json({ error: 'invalid beatmapsetId' }, { status: 400 })` before any fetch.
- Lines 84-94: replace the hardcoded 4-URL array and the dead `mirror` param branch with
  `PROXY_ONLY_MIRRORS` from `mirrors.js` (2 entries, not 4).
- Line 108: replace `'osu-playlist-sync/1.0 (web-app)'` with `UA_PROFILES.mirror` (from
  server-hardening's `http.js`; see Cross-workstream interfaces).
- Lines 103-120: replace the manual `AbortController`/`contentType.includes` no-op guard with a call
  to server-hardening's `fetchWithLimits(url, { timeoutMs: 4000, maxBytes: MAX_PROXY_ARCHIVE_BYTES, ua })`
  per mirror, then peek the first chunk through `isValidArchiveChunk` before relaying; reject (skip to
  next mirror) on a non-ZIP first chunk instead of trusting `res.status === 200`.
- Line 130: replace the inline sanitiser with `sanitizeFilename` + `contentDisposition` from
  `filename.js`.
- Lines 151-158: on total failure (both mirrors rejected or errored), return
  `NextResponse.json({ error: 'no mirror had this beatmapset' }, { status: 502 })` instead of the
  synthetic archive; no `X-Selected-Mirror: fallback-generator` path remains.
- Add `export const maxDuration = 10;` (new, none existed before).
- Add a rate-limit check at the top of `GET`, either transparent (server-hardening's middleware
  covers `/api/*`) or an explicit `checkLimit` call if middleware isn't ready first — see
  Cross-workstream interfaces.

**`src/lib/beatmapDownload.js`** (116 lines, fully owned)
- Lines 19-22: delete the local `CORS_MIRRORS`, import it from `mirrors.js` instead (comment at
  lines 1-18 moves to `mirrors.js` or is trimmed to a one-line pointer).
- Line 29: delete local `MIN_ARCHIVE_BYTES`, import `isValidArchiveBlob` from `archive.js`.
- Line 95: replace `if (!blob || blob.size < MIN_ARCHIVE_BYTES) continue;` with
  `if (!(await isValidArchiveBlob(blob))) continue;`.
- Lines 109-112: apply the same `isValidArchiveBlob` check to the proxy blob before returning it
  (this is F-04's actual fix — today the proxy path has no check at all).
- Lines 58-85 (`fetchBlob`): capture `res.status`; on `429`, wait `Retry-After` (seconds, capped at
  5s) or a flat 2s if absent, retry once, then give up — this is the only branch added, no new
  parameter shape.
- Lines 58, 91: add an optional `signal` parameter to `fetchBlob` and `fetchBeatmapArchive`, combined
  with the existing internal timeout via `AbortSignal.any([controller.signal, externalSignal])`
  (falls back to manual combination if `AbortSignal.any` is unavailable in the target Node/browser
  runtime — checked at implementation time, not assumed).

**`src/components/StatsBar.js`** (235 lines, fully owned)
- New props: `isBatchActive`, `onCancelBatch`.
- Line 152: `disabled={selectedCount === 0 || isSearching || isBatchActive}`.
- Line 179: `disabled={selectedCount === 0 || isDownloadingZip || isSearching || isBatchActive}`
  (keeps `isDownloadingZip` for the in-progress ZIP label; `isBatchActive` also covers a plain batch
  download running).
- New Cancel button, rendered only when `isBatchActive`, next to the Download/ZIP buttons, calling
  `onCancelBatch`. Deliberate deviation from F-44's literal fixDirection (DownloadToast): the toast
  stack and `pushToast` are matching-player's, so the cancel affordance lives here instead, fully
  inside owned territory.

**`src/components/DownloadToast.js`** (250 lines, fully owned)
- No structural change. `toast.detail` already truncates with an ellipsis (line 221), which is
  sufficient for a partial-failure message like "42 could not be fetched"; no new toast kind needed.

**`src/app/page.js`** (owned ranges only: line 21, lines 65-75, lines 736-860)
- Line 21: `import JSZip from 'jszip'` deleted; ZIP path uses `const { default: JSZip } = await
  import('jszip')` inside `handleDownloadZipBatch`, so JSZip is not in the initial bundle.
- Lines 65-75 (`downloadBlob`): wrap the revoke in `setTimeout(() => URL.revokeObjectURL(url), 1000)`.
- Lines 742-774 (`handleDownloadSingle`): thread an optional `signal` through to
  `fetchBeatmapArchive`; line ~769's `window.open` fallback changes from
  `` `https://catboy.best/d/${beatmapId}` `` to `beatmapsetPage(beatmapId)` from `mirrors.js` (F-34);
  filename construction uses `sanitizeFilename` from `filename.js` instead of the inline regex.
- Lines 780-801 (`handleDownloadBatch`) and 804-858 (`handleDownloadZipBatch`): both gain a shared
  `isBatchActiveRef`/state guard set true on entry and false in a `finally`, so a second click on
  either button while the other is running is a no-op even before StatsBar's `disabled` prop takes
  effect (belt and suspenders against a race between click and re-render); both create one
  `AbortController` per batch, pass its `signal` down, and `onCancelBatch` (wired by client-ui in its
  own JSX range) calls `.abort()` on it.
- `handleDownloadZipBatch`: add `MAX_ZIP_BYTES` running total (sum of `result.blob.size`); stop
  adding further files once the running total would exceed it, and note the skipped count in the
  final toast, rather than growing `zip` unbounded — this is the "hard cap with clear message"
  option from the architect note, chosen over a streaming zip writer or a new dependency.
- **Explicitly out of range, left to other workstreams**: `handleClearList` (873-880) does not reset
  `downloadingIds`/`isDownloadingZip`/the new batch-active flag on Clear List; this is a real gap but
  those lines belong to client-ui. Noted under Cross-workstream interfaces below instead of fixed
  here.

## Cross-workstream interfaces

**Needed from server-hardening:**
- `fetchWithLimits(url, { timeoutMs, maxBytes, ua, signal? }) → Response`-like object, streaming-capped
  (X-02). Consumed in route.js for each of the 2 `PROXY_ONLY_MIRRORS` attempts. If this lands after
  downloads-cost, route.js keeps its current manual `AbortController` + a local byte-counting reader
  until it does (see Implementation order, step 3 is written to be swappable).
- `UA_PROFILES.mirror`, one string used for every mirror, not a catboy-only special case (X-07). Until
  this exists, route.js keeps a local constant `MIRROR_UA` with the same value so the swap is a
  one-line import change, not a rewrite.
- A rate-limit interface for `/api/download`: either transparent edge-middleware coverage (X-01), or,
  if that isn't ready first, `checkLimit(key, { limit, windowMs }) → { allowed, retryAfterMs }` from a
  `src/lib/ratelimit.js` that downloads-cost will call directly with `key = clientIp`,
  `limit: 15, windowMs: 10 * 60 * 1000`. This budget is presented as a courtesy deterrent, not the
  hard guarantee — see Risks (D-11: a per-instance counter is weak on serverless). The hard guarantee
  is the per-request `maxBytes`/`maxDuration` pair, which does not depend on this interface existing.
- `src/lib/validate.js` (X-03), if it exists by implementation time, may supply the integer-id
  validator instead of route.js's own regex; either is acceptable, the contract is "reject anything
  that isn't a small positive integer before any mirror is contacted."

**Provided to other workstreams:**
- `MIRROR_HOSTS` from `mirrors.js` — server-hardening's CSP work (F-25) should read its `connect-src`
  list from here rather than hardcoding the four hostnames a second time.
- Confirmation that nothing in downloads-cost consumes `osu.js`'s `downloadUrl` field (only
  occurrence outside `osu.js` was never found in `src/`) — matching-player's F-37 deletion of that
  field is safe with respect to this workstream.
- `sanitizeFilename`/`contentDisposition` (`filename.js`) are generic and available to any other route
  that builds a `Content-Disposition` header (none currently do outside `/api/download`).

## Implementation order

1. Add `src/lib/mirrors.js`, `src/lib/archive.js`, `src/lib/filename.js`. No behavior change; nothing
   imports them yet. Verifiable with `node --check` on each new file.
2. Wire `beatmapDownload.js` to the three new modules (mirror list, archive validation on both
   branches, filename left alone here since it's page.js's construction that uses it) plus the 429
   backoff and the optional `signal` parameter. Verifiable with `npm run bench` unaffected (bench
   never touches this file) and a manual browser download of one known-good beatmapset.
3. Rewrite `route.js`: id validation, new mirror list, shared UA constant (swappable for
   `UA_PROFILES.mirror` later), shared archive check, delete `generateFallbackOsz`, add
   `maxDuration`, add the byte cap (via `fetchWithLimits` if ready, else a local streaming counter).
   Verifiable with the curl checks below.
4. `page.js` owned-range edits: dynamic `import('jszip')`, `downloadBlob` revoke timing, F-34's
   `window.open` target, `sanitizeFilename` usage, `MAX_ZIP_BYTES` cap, `isBatchActive` state +
   `AbortController` threading. Verifiable in-browser (batch download, ZIP, cancel mid-batch).
5. `StatsBar.js`: `isBatchActive`/`onCancelBatch` props and the Cancel button. Verifiable visually;
   full wiring (the JSX call sites in page.js's 861-994/1011-1106 range) is client-ui's to land, so
   this step ships the component change and hands off the prop names.
6. Rate limiting: add `checkLimit` call to route.js once `ratelimit.js` exists, or confirm middleware
   coverage — whichever lands first from server-hardening.

Each step is independently revertable and touches a disjoint set of lines within owned files.

## Risks

- **Dropping catboy/nerinyan from the server mirror list** may regress recovery for a user whose
  network specifically blocks those two hosts (not just CORS-blocks them) — mitigated by the F-34 fix
  routing the final fallback to the beatmapset's own osu! page, which always resolves, rather than a
  dead mirror link.
- **A 50MB `MAX_PROXY_ARCHIVE_BYTES` cap** (chosen below) will hard-fail a legitimately larger marathon
  beatmapset proxied through beatconnect/sayobot — mitigated because this only affects the proxy path
  (rare: CORS mirrors handle the common case and have no such cap imposed by this plan), and the
  failure is an honest error, not a corrupted download.
- **A 4000ms per-mirror `timeoutMs`** may abort a slow-but-legitimate server-to-server transfer before
  it completes, more often than the previous 6s value — mitigated by trying up to 2 mirrors within the
  10s `maxDuration`, and by this being strictly better than the current unbounded-content-type-guard
  behavior it replaces.
- **Deleting `generateFallbackOsz`** could be read as removing a feature — mitigated by D-10's explicit
  permission in `2-findings.md` and by 00-map's feature inventory treating a real archive as the
  contract, not a synthetic placeholder that was never a real beatmap.
- **The inline `checkLimit` rate budget is per-serverless-instance**, not global (D-11) — a distributed
  attacker can exceed the intended ceiling by hitting different warm instances. Mitigated by the fact
  the real backstop is the per-request byte/time cap, which holds regardless of how many instances are
  hit; the rate limit only bounds cost for a *single* misbehaving client on a *single* instance.
- **`AbortSignal.any` availability**: if the Node runtime Vercel deploys doesn't support it, the manual
  combination fallback (listen on both signals, abort the shared controller) must ship instead —
  flagged so implementation checks this before assuming the one-liner works.

## Verification

```bash
# id validation (expect 400, no mirror contacted)
curl -sS -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/download?beatmapsetId=abc"
curl -sS -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/download?beatmapsetId=-1"

# a real id: expect 200 and a real X-Selected-Mirror (not fallback-generator)
curl -sS -D - -o /tmp/out.osz "http://localhost:3000/api/download?beatmapsetId=1" | grep -i x-selected-mirror
node -e "const fs=require('fs');const b=fs.readFileSync('/tmp/out.osz');console.log(b.slice(0,4).toString('hex'))"
# expect 504b0304 (PK\x03\x04)

# archive.js unit check, no framework needed per CLAUDE.md
node --test  # or: node -e "require('./src/lib/archive.js')" after adding a .mjs export test
```

- `npm run bench` and `npm run bench:cost` before and after: this workstream touches no file bench
  imports (`bench/scorers/shipped.mjs` only imports `src/lib/osu.js`), so both must reproduce the
  baseline exactly (hit 31, correctAbstain 6, WRONG ARTIST 0, miss 0, unreachable 0, correct maps
  offered 752, hard-rejected correct 22; 55 calls / 1.49 per track). A changed number here means a
  downloads-cost edit leaked into matching code and must be reverted.
- Browser: batch-download 3+ selected songs, click ZIP while a batch download is still running —
  expect both buttons disabled, not two overlapping operations; click Cancel mid-batch — expect the
  in-flight fetch to abort and the toast to report a partial count, not a crash.
- Browser: force a mirror failure (temporarily blackhole one host via `/etc/hosts` equivalent, not via
  another live request) — expect a toast, never a downloaded file, and never a ZIP entry sized under
  10KB.
- `npm run lint`: this repo has no `.eslintrc` yet, so a first run prompts interactively
  ("Strict (recommended) / Base / Cancel"); answer once to generate config, or substitute
  `node --check src/app/api/download/route.js src/lib/beatmapDownload.js src/lib/archive.js
  src/lib/mirrors.js src/lib/filename.js` for a syntax-only check on changed files.

## Cost impact

| dimension | before | after | reasoning |
|---|---|---|---|
| osu! API calls | 0 | 0 | this workstream never calls `/api/osu/*`; download routing is independent of matching |
| Vercel function invocations | 1 per proxy fallback (unbounded frequency, no rate limit) | same trigger frequency, but now capped in duration (`maxDuration=10`) and gated by a per-IP budget (15/10min) | invocation *count* isn't reduced (still one per proxy call), but each invocation's worst-case cost (GB-seconds, hang risk) is bounded for the first time |
| origin transfer, worst case | unbounded: no byte cap, no timeout enforcement beyond a 6s-per-mirror abort that never checked bytes already sent | capped at `MAX_PROXY_ARCHIVE_BYTES = 50MB` per request; a single IP sustaining the 15-req/10min budget forever tops out at 15 × 50MB = 750MB per 10 minutes ≈ 4.5GB/hour per attacking IP — bounded, though the per-instance limiter means a distributed attacker can multiply this by however many warm instances they hit (see Risks) | first-ever hard ceiling on this route; previously a single slow/malicious client could hold a function open indefinitely relaying an arbitrarily large body |
| bundle size (initial JS) | `jszip` statically imported at page.js:21 (jszip 3.10.1, `jszip.min.js` is 97,630 bytes minified, confirmed via `node_modules/jszip/dist/jszip.min.js`) ships to every visitor whether or not they ever click ZIP | dynamic `import('jszip')` loads it only when `handleDownloadZipBatch` runs | removes ~95KB minified (roughly 30KB gzipped, typical ~65-70% JS compression) from the initial bundle for the common case (search + single/batch download, no ZIP) |
| server function bundle | route.js statically imported `jszip` for `generateFallbackOsz` | import deleted entirely | smaller cold-start bundle for `/api/download`, marginal cold-start latency win, not quantified further as Vercel doesn't expose per-route cold-start bundle size without a build (and a build cannot be run while dev is up) |

`streamFiles: true` is confirmed supported by the installed jszip version (`grep -c streamFiles
node_modules/jszip/dist/jszip.js` → 8 matches), so the ZIP-path change needs no dependency bump.
