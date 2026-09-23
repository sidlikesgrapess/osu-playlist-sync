# Consolidated findings

Phase 2 consolidation of the six Phase 1 audits (1-extraction, 1-matching-api, 1-player, 1-downloads,
1-client-ui, 1-platform-security) and the 00-map sections "Feature inventory" and "Candidate duplication".

The audits hold 70 raw entries: EXT-01..15, MAT-01..11, PLY-01..11, DL-01..14, UI-01..08 and SEC-01..11.
Three of them (EXT-14, EXT-15, UI-08) are explicit "no finding" entries and are not counted; see
"Doubtful or contract-risky". The other 67 merge into 50 findings (F-01..F-50). Eleven cross-area findings
(X-01..X-11) are added on top. Every raw id appears in exactly one finding's `sources`, except SEC-03,
whose download half is in F-01 and whose remainder is X-01.

Confidence is carried over from the strongest source (verified > traced > speculative) and is never raised
here. Where a severity differs from the strongest source's, the finding's `evidence` ends with
"Severity changed: <from> to <to>: <reason>".

Parity baseline for every bench check, taken from 1-matching-api.md "Baseline":
- `npm run bench` (2026-09-22 snapshot, 37 fixtures, threshold 70), shipped scorer:
  - hit 31 (83.8%), correctAbstain 6 (16.2%)
  - WRONG ARTIST 0, miss 0, unreachable 0, unlabelled 0
  - correct maps offered 752, hard-rejected correct 22
- `npm run bench:cost`, shipped scorer: 47 title queries + 8 probes = 55 calls, 1.49 per track.
- `strictnessProfile(50)` = `{titleFloor:0.5, minScore:70, maxArtistRung:6, salvageFloor:0.92}`.

## Counts (by severity, by workstream)

| severity | F | X | total |
|---|---|---|---|
| critical | 3 | 0 | 3 |
| high | 15 | 1 | 16 |
| medium | 18 | 8 | 26 |
| low | 14 | 2 | 16 |
| **total** | 50 | 11 | 61 |

| workstream | critical | high | medium | low | total |
|---|---|---|---|---|---|
| downloads-cost | 2 | 4 | 2 | 5 | 13 |
| server-hardening | 1 | 4 | 8 | 4 | 17 |
| matching-player | 0 | 8 | 11 | 5 | 24 |
| client-ui | 0 | 0 | 5 | 2 | 7 |
| **total** | 3 | 16 | 26 | 16 | 61 |

## Workstreams

| name | goal | owned files | shared files (line ranges owned) | finding ids (severity order) |
|---|---|---|---|---|
| downloads-cost | Cap the server fallback, keep it honest and rarely reached, and make single, batch and ZIP downloads count only real archives. | `src/app/api/download/route.js`, `src/lib/beatmapDownload.js`, `src/components/StatsBar.js`, `src/components/DownloadToast.js`, new `src/lib/filename.js` | `src/app/page.js`: 21 (JSZip import), 65-75 (`downloadBlob`), 736-860 (`getSelectedSongs`, `handleDownloadSingle`, `handleDownloadBatch`, `handleDownloadZipBatch`). Any new state such as a batch-in-flight flag is declared inside 736-760, not in the top state block | F-01, F-03, F-04, F-15, F-16, F-17, F-24, F-34, F-38, F-42, F-43, F-44, X-11 |
| server-hardening | Never fetch a caller-controlled URL. Put one rate limit, one validator and one fetch helper (timeout and size cap) in front of every route. Make extraction failures surface as errors, not fake results. | `src/lib/extractors.js`, `src/lib/youtube.js`, `src/lib/titleCleaner.js`, `src/app/api/playlist/route.js`, `src/app/api/github/commits/route.js`, `next.config.mjs`, `package.json`, new `src/middleware.js`, new `src/lib/http.js`, new `src/lib/validate.js`, new `src/lib/platform.js` | `src/app/page.js`: 334-407 (`handleFetchPlaylist`), 995-1010 (the `playlistMeta.isDemo` badge block). `src/components/PlaylistInput.js`: 147-158 (`detectPlatform` only) | F-02, F-06, F-07, F-18, X-01, F-23, F-25, F-26, F-27, F-28, X-02, X-03, X-07, F-45, F-46, F-47, F-50 |
| matching-player | Gate manual search like every other search. Make "Ranked & Loved" mean one status set on every path. Stop reporting upstream failures as confident no-matches. Make the player screen honest about demo mode, errors, truncation and stale responses without spending extra osu! calls. | `src/lib/osu.js`, `src/app/api/osu/search/route.js`, `src/app/api/osu/player/route.js`, `src/app/api/osu/player/beatmaps/route.js`, `src/lib/beatmapFormat.js`, `src/lib/matchStrictness.js` (read only unless the curve itself is wrong), new `src/lib/song.js` | `src/app/page.js`: 22-64 (`beatmapToSong`, `blankMatchState`), 125-333 (`handleSubmitInput`, player handlers, `mergeSongs`, `loadSection`, `reloadPlayerSections`), 408-735 (`searchTargetSongs`, pagination triggers, `rematchVisiblePage`, `narrowMatchesToRanked`, strictness, `handleManualSearch`, selection handlers). `src/components/PlayerSections.js`: 370-400 (section header total and truncation notice) | F-05, F-08, F-09, F-10, F-11, F-12, F-13, F-14, F-22, F-29, F-30, F-31, F-32, F-33, X-04, X-05, X-06, X-08, X-09, F-37, F-39, F-40, F-41, F-48 |
| client-ui | Re-render only the row whose song changed, load images lazily, give audio preview one owner, and keep SongRow, SongCardMobile and BeatmapRow in parity at every width. | `src/components/SongTable.js`, `src/components/SongRow.js`, `src/components/SongCardMobile.js`, `src/components/PlayerResults.js`, `src/app/globals.css`, new `src/lib/useAudioPreview.js` | `src/app/page.js`: 1-20 (imports except line 21), 76-124 (top state and hooks), 861-994 and 1011-1106 (handlers after the download block, JSX and prop wiring, where stable callback wrappers go). `src/components/PlayerSections.js`: everything except 370-400, notably 83-200 (`BeatmapRow`), 300-340 (audio) and 460-510 (list render) | F-19, F-20, F-21, F-35, F-36, F-49, X-10 |

Shared-file rules:
- **`src/app/page.js` is split by line range as above.**
  - Line numbers are as of commit bdc6990. Whoever merges second rebases by function name, not by line number.
  - No workstream edits a handler body outside its own range.
  - client-ui makes callbacks stable at the JSX prop sites (a ref-backed `useStableCallback` wrapper), so it
    never has to touch handler bodies owned by other workstreams.
- **`src/components/PlayerSections.js`:** matching-player owns only the section header (the `section.total`
  render near line 388). client-ui owns everything else.
- **`src/lib/titleCleaner.js`** belongs to server-hardening, together with `extractors.js`. That keeps the
  `source` argument F-28 adds at the `cleanSongTitle` call site inside one workstream.
- **`src/lib/osu.js:905`** (`downloadUrl`, F-37) is a downloads concern, but it lives in matching-player's
  file, so matching-player deletes it.
- **`src/lib/http.js` and `src/lib/validate.js`** are created by server-hardening in its first commit.
  - downloads-cost imports them in the download route; matching-player imports them in the osu routes.
  - Until they land, those two workstreams may inline a two-line check and switch to the import after rebasing.
- **Order that minimises conflicts:**
  1. server-hardening lands the shared helpers first.
  2. downloads-cost and matching-player run in parallel.
  3. client-ui goes last: it rebases onto everyone's page.js edits and does the phone-width pass over the
     final UI.

### downloads-cost

- **Goal:** the proxy fallback is capped on the server and rarely reached, and no path (single, batch or
  ZIP) ever reports a placeholder or an HTML page as a real beatmap.
- **Findings, in severity order:**
  - critical: F-01, F-03
  - high: F-04, F-15, F-16, F-17
  - medium: F-24, F-34
  - low: F-38, F-42, F-43, F-44, X-11
- **Contracts most at risk:**
  - Normal-path download bytes never pass through a Vercel function. Do not route the CORS mirrors through
    the proxy while fixing it.
  - The fallback is capped on the server and never reports a placeholder as real.
  - ZIP bundling stays client-side.
  - The single, batch and ZIP download features all survive.
  - Desktop and mobile download buttons show the same state.
  - Toast copy uses no dash as punctuation.
- **Verification:** curl the dev server with a browser UA.
  - `curl -sS -D - -o /dev/null "http://localhost:3000/api/download?beatmapsetId=999999999"` must not return
    a 200 that the client counts as a success. It either returns non-2xx, or returns
    `X-Selected-Mirror: fallback-generator` and `fetchBeatmapArchive` rejects it.
  - `beatmapsetId=abc` and `beatmapsetId=1%2F..%2Fx` return 400 before any mirror is contacted.
  - Going over the per-IP budget returns 429.
  - A node check of the content-type predicate rejects `text/html` served with status 200.
  - In the browser:
    - A healthy id downloads with no `/api/download` request in the Network tab.
    - Double-clicking Download runs one loop.
    - A ZIP over the cap is refused with a message.
  - `npm run lint`. Bench is not needed; nothing here touches the scorer.

### server-hardening

- **Goal:** no caller-controlled URL is ever fetched. Every route sits behind one rate limit and one
  validator, and every outbound fetch has a timeout and a size cap. Extraction failures surface as errors.
- **Findings, in severity order:**
  - critical: F-02
  - high: F-06, F-07, F-18, X-01
  - medium: F-23, F-25, F-26, F-27, F-28, X-02, X-03, X-07
  - low: F-45, F-46, F-47, F-50
- **Contracts most at risk:**
  - Spotify, Apple and YouTube stay zero-key: no new keys. When no shared store is configured, the rate
    limiter must fall back to per-instance memory and never crash.
  - `source` stays populated on every path, and the song object shape is unchanged.
  - Demo mode still returns `{ isDemo: true }` and never crashes. Extraction failure gets its own flag
    instead of reusing the osu! demo flag.
  - `titleCleaner` changes are recall changes, measured by bench.
  - Paste-a-link extraction and the multi-playlist append queue both survive.
  - The Next major upgrade (F-23) must not lose any inventory feature.
- **Verification:**
  - `curl "http://localhost:3000/api/playlist?url=https://example.com/?x=music.apple.com"` returns 400, with
    no outbound request in the fetch helper's log.
  - The EXT-02 Apple playlist returns about 50 tracks, not 1.
  - A nonexistent YouTube playlist returns an error, not six fake songs.
  - `curl -I http://localhost:3000/` shows the new security headers, and the app still renders. The CSP must
    allow the image CDNs and the mirrors the browser fetches directly.
  - N+1 rapid requests to any `/api/*` route return 429.
  - Around F-28 and F-46, run `npm run bench` before and after. The shipped row must match the baseline
    above, including bench:cost at 1.49 per track. If the fixtures bypass `cleanSongTitle`, also diff the
    cleaned query for every fixture title before and after.
  - Phone-width check of the demo and append notice.

### matching-player

- **Goal:** manual search is gated like every other search, and "Ranked & Loved" means one status set on
  every path. Upstream failures are not reported as confident no-matches. The player screen is honest about
  demo mode, errors, truncation and stale responses, and spends no extra osu! calls.
- **Findings, in severity order:**
  - high: F-05, F-08, F-09, F-10, F-11, F-12, F-13, F-14
  - medium: F-22, F-29, F-30, F-31, F-32, F-33, X-04, X-05, X-06, X-08, X-09
  - low: F-37, F-39, F-40, F-41, F-48
- **Contracts most at risk:**
  - The artist is a gate, never a weight:
    - a confident DIFFERENT returns `-Infinity`;
    - trust comes from the alias set, never a row count;
    - rejection reasons are kept;
    - artistOverride is shown with its notice and never auto-selected.
  - Strictness lives only in `matchStrictness.js`, and 50 = floor 0.50 / cutoff 70.
  - The bench shipped scorer shows no regression.
  - Demo mode returns `{ isDemo: true }`.
  - The token cache stays; one fetch window with local pagination; collection filters applied after the
    fetch.
  - `beatmapToSong` keeps both paths identical, with `source` populated.
- **Verification:**
  - Run `npm run bench` and `npm run bench:cost` before and after every change to `osu.js`, against the
    baseline:
    - hit stays at 31/37 or better; WRONG ARTIST and miss stay at 0;
    - correct maps offered stays at 752 or more;
    - calls per track stay at 1.49 or fewer.
  - `strictnessProfile(50)` is unchanged.
  - With credentials unset, a node one-liner shows that `searchOsuUsers`, `getUserBeatmapCollection` and both
    player routes return `isDemo: true`.
  - curl:
    - A manual-search request now carries the artist, and returns `artistOverride` for a wrong artist.
    - `/api/osu/player/beatmaps?userId=999999999999&type=best` returns 404 with a plain message and no
      upstream path.
    - `userId=1%2F..%2Fx` returns 400.
    - A fallbacks array of 50 entries runs at most the capped number of upstream queries. Count them in a
      log with a small n, not a flood.
    - One live `status=ranked` call for a popular query returns loved or qualified sets.
  - The most_played section for peppy (userId 2) shows copy in the style of "88 of 469".

### client-ui

- **Goal:** each change re-renders only its own row, images load lazily, audio preview has one owner, and
  SongRow, SongCardMobile and BeatmapRow stay in parity at every width.
- **Findings, in severity order:**
  - medium: F-19, F-20, F-21, F-35, F-36
  - low: F-49, X-10
- **Contracts most at risk:**
  - Desktop and mobile both work, with no horizontal scroll at phone width.
  - Desktop and mobile stay separate components: share hooks, not components.
  - The artistOverride mark is always paired with its notice.
  - The inline `style={{}}` convention stays, and `beatmapFormat.js` stays the shared visual home.
  - The song table, the mobile cards, audio preview, the alternate-match picker and the player sections all
    survive.
- **Verification:**
  - Phone-width (375px) and desktop screenshots with the screenshot-app skill, of the song table, a player
    profile with a section open, and the alternate-match picker. None may scroll horizontally.
  - React profiler during a 50-track search: each row re-renders only when its own song changes.
  - Network tab: cover images load on scroll, not all at once, and each song's cover is fetched once, not
    twice.
  - Start a preview, then change page or filter: the preview stops.
  - A failing preview URL shows a visible error state.
  - `npm run lint`.

## Findings

### F-01 /api/download is an open, uncapped byte proxy with no maxDuration

```json
{
  "id": "F-01",
  "sources": ["DL-01", "SEC-04", "SEC-03 (download half)"],
  "area": "downloads",
  "dimension": "cost",
  "title": "/api/download is an unauthenticated, uncapped byte proxy with no maxDuration, and the fallback budget exists only in the browser",
  "file": "src/app/api/download/route.js",
  "line": 70,
  "severity": "critical",
  "evidence": "route.js:70-166 accepts any beatmapsetId from anyone, walks mirrors at 101-128 and streams the full archive body back through the function at 144, with no size cap, no per-client limit and no maxDuration export. The only budget (5 proxy fallbacks per batch) lives in the browser at beatmapDownload.js:39 and :103, so any script calling the route directly bypasses it. This is the route behind the earlier Fast Origin Transfer incident.",
  "reproduction": "Loop `curl -o /dev/null http://localhost:3000/api/download?beatmapsetId=<valid id>` with no Referer or cookie: every call is served in full, and the transferred bytes are billed to the function.",
  "confidence": "verified",
  "workstream": "downloads-cost",
  "fixDirection": "Enforce the budget on the server: a per-IP rate limit (X-01 middleware), a response size cap, checked against Content-Length before streaming and aborted mid-stream past the cap, and an explicit `export const maxDuration`. Keep the browser budget as a courtesy layer only."
}
```

### F-02 Apple Music branch fetches any URL containing the substring music.apple.com (SSRF)

```json
{
  "id": "F-02",
  "sources": ["EXT-01", "SEC-01"],
  "area": "extraction",
  "dimension": "security",
  "title": "Platform detection uses substring match, so the Apple branch fetches an arbitrary caller-supplied URL server side",
  "file": "src/lib/extractors.js",
  "line": 188,
  "severity": "critical",
  "evidence": "extractors.js:188 routes to the Apple extractor on `url.includes('music.apple.com')`. extractors.js:77-78 then calls `fetch(url)` on the raw string, so `http://169.254.169.254/?music.apple.com` or any internal host is fetched from the function and its HTML parsed. The Spotify and YouTube branches use the same substring style.",
  "reproduction": "`curl \"http://localhost:3000/api/playlist?url=http://127.0.0.1:3000/?music.apple.com\"`: the server fetches its own origin.",
  "confidence": "verified",
  "workstream": "server-hardening",
  "fixDirection": "One general rule for all three branches: parse with `new URL`, require https, and match `hostname` exactly against an allowlist of provider hosts in a single `src/lib/platform.js`. Rebuild the fetched URL from the parsed parts, never from the raw input string. Also use it in PlaylistInput (F-47)."
}
```

### F-03 The placeholder .osz is counted as a real download

```json
{
  "id": "F-03",
  "sources": ["DL-02", "DL-12"],
  "area": "downloads",
  "dimension": "correctness",
  "title": "When every proxy mirror fails, the generated placeholder .osz is saved and counted as a success in single, batch and ZIP",
  "file": "src/lib/beatmapDownload.js",
  "line": 105,
  "severity": "critical",
  "evidence": "route.js:150-161 returns 200 with a synthetic archive (placeholder map, 8 bytes of fake mp3) and `X-Selected-Mirror: fallback-generator`. beatmapDownload.js:105-115 applies no MIN_ARCHIVE_BYTES check and no header check on the proxy path, so it accepts the placeholder. page.js:749-759 (single), 788/792 (batch) and 822-826/852 (ZIP) then count it as downloaded. The user believes they have maps they do not have.",
  "reproduction": "With all proxy mirrors failing (e.g. id 999999999, or offline mirrors), select a song and Download: the toast reports success and a 1 KB .osz with no audio is saved or zipped.",
  "confidence": "verified",
  "workstream": "downloads-cost",
  "fixDirection": "Make it impossible to report a placeholder as real, in one place: either the route returns non-2xx instead of generating one, or `fetchBeatmapArchive` rejects any response whose `X-Selected-Mirror` is `fallback-generator` or whose size is under MIN_ARCHIVE_BYTES, on every path. The three page.js callers then share one failure branch."
}
```

### F-04 Proxy content-type guard is a no-op, so HTML error pages ship as .osz

```json
{
  "id": "F-04",
  "sources": ["SEC-05"],
  "area": "downloads",
  "dimension": "correctness",
  "title": "The mirror response check `!ct.includes('text/html') || res.status === 200` accepts any 200 HTML page as a beatmap",
  "file": "src/app/api/download/route.js",
  "line": 119,
  "severity": "high",
  "evidence": "route.js:119: the `|| res.status === 200` makes the guard true for every 200, including a mirror's HTML error or rate-limit page. The page is streamed back as `<id>.osz` with the mirror named in X-Selected-Mirror, so neither the client nor the header can tell it apart from a real archive.",
  "reproduction": "Node check of the predicate: `ct='text/html; charset=utf-8', status=200` gives true. Against a mirror that serves an HTML 200 for a missing set, the saved file is HTML.",
  "confidence": "verified",
  "workstream": "downloads-cost",
  "fixDirection": "Accept only `res.ok` together with a non-HTML content type, and verify the ZIP magic bytes (`PK\\x03\\x04`) on the first chunk before streaming. Put the same predicate in the browser path so both sides share one definition of \"is an archive\"."
}
```

### F-05 Manual search bypasses the artist gate

```json
{
  "id": "F-05",
  "sources": ["MAT-01"],
  "area": "matching-api",
  "dimension": "correctness",
  "title": "handleManualSearch posts only the query, so the artist gate never runs and wrong-artist results can be auto-selected",
  "file": "src/app/page.js",
  "line": 676,
  "severity": "high",
  "evidence": "page.js:676-681 builds the body without artist, title or source, and page.js:689 auto-selects the top result. search/route.js:11 reads artist as undefined, and osu.js:503-524 skips `artistVerdict`/`resolveArtistTrust` when there is no target artist, so artistOverride and rejection are never produced. Severity changed: critical to high: a user-visible wrong result, not cost, a security hole or data loss.",
  "reproduction": "Search a track, then use the manual search box with the same title: the request body has no artist, and a same-title set by a different artist comes back with a numeric matchScore and auto-selected.",
  "confidence": "verified",
  "workstream": "matching-player",
  "fixDirection": "Send manual queries through the same request builder as searchTargetSongs (X-08). Do not blindly force the old artist onto a query the user deliberately edited: re-derive artist and title from the edited text with `cleanSongTitle`, and set `source` to reflect how much that artist can be trusted (non-structured, so resolveArtistTrust decides). See Doubtful D-02."
}
```

### F-06 Apple Music playlists collapse to one fake song

```json
{
  "id": "F-06",
  "sources": ["EXT-02"],
  "area": "extraction",
  "dimension": "correctness",
  "title": "Apple's ld+json regex no longer matches the page, so a playlist silently falls through to a one-song OpenGraph result",
  "file": "src/lib/extractors.js",
  "line": 90,
  "severity": "high",
  "evidence": "extractors.js:90 expects `type=\"application/ld+json\"` before any other attribute. The current Apple markup puts `id` first, so the match fails. extractors.js:119-140 then builds a single song from og:title, which is the playlist name, and returns it as a successful extraction. Severity changed: critical to high: a user-visible wrong result, not a security hole, runaway cost or data loss.",
  "reproduction": "Paste a 50-track public Apple Music playlist: one row appears, titled with the playlist name.",
  "confidence": "verified",
  "workstream": "server-hardening",
  "fixDirection": "Match the script tag by attribute presence, independent of order (or scan every ld+json block and pick the MusicPlaylist/MusicAlbum one). General rule: a fallback may never stand in for a collection silently. If a playlist or album URL yields at most one track, or og:title equals the collection name, return an extraction error instead of a fake track."
}
```

### F-07 A YouTube failure returns a fake six-song demo playlist as success

```json
{
  "id": "F-07",
  "sources": ["EXT-03", "EXT-06"],
  "area": "extraction",
  "dimension": "correctness",
  "title": "Any YouTube extraction failure returns a hardcoded demo playlist with 200, and when appended the demo badge never shows",
  "file": "src/lib/youtube.js",
  "line": 88,
  "severity": "high",
  "evidence": "youtube.js:45 and :88 catch every failure and return `getDemoPlaylist()` (youtube.js:267) flagged `isDemo`, and /api/playlist passes it through as a success. page.js:356-364 stores playlistMeta only on the replace path, and 383-390 appends the fake songs, so the badge at page.js:1000 never renders on append. The fake songs are then searched against osu!, spending real API calls. This also overloads `isDemo`, which elsewhere means \"no osu! credentials\" (X-04).",
  "reproduction": "Paste `https://www.youtube.com/playlist?list=PLdoesnotexist000`: six unrelated songs appear. With songs already listed, they are appended and no badge is shown.",
  "confidence": "verified",
  "workstream": "server-hardening",
  "fixDirection": "Return a real error (4xx for not found or private, 502 for provider changed) with a plain message, and delete getDemoPlaylist from the extraction path. If a demo playlist is kept for keyless onboarding, it is served only on explicit request and never as a failure substitute."
}
```

### F-08 Upstream status=ranked drops loved and qualified sets

```json
{
  "id": "F-08",
  "sources": ["MAT-02"],
  "area": "matching-api",
  "dimension": "correctness",
  "title": "The Ranked & Loved filter sends `s=ranked` upstream, so loved and qualified sets are never fetched and the local filter cannot restore them",
  "file": "src/lib/osu.js",
  "line": 719,
  "severity": "high",
  "evidence": "osu.js:709 sets isRankedOnly, and osu.js:719 builds `&s=${isRankedOnly ? 'ranked' : 'any'}`. The local filter at osu.js:738-739 then allows loved, but loved sets were never in the response. A song whose only map is loved comes back no-match under the default filter.",
  "reproduction": "Search a title whose only set is loved with the Ranked & Loved filter on: no-match. With the filter off it matches.",
  "confidence": "verified",
  "workstream": "matching-player",
  "fixDirection": "Request the upstream status that is a superset of the local filter, then filter locally by the one shared status constant (F-30). See Doubtful D-03: removing `s` entirely may pull graveyard sets into the pool and change bench. Needs one live capture and a bench run before choosing."
}
```

### F-09 A 429 from osu! search is reported as a confident no-match

```json
{
  "id": "F-09",
  "sources": ["MAT-03"],
  "area": "matching-api",
  "dimension": "correctness",
  "title": "The search loop uses a raw fetch that swallows non-OK responses, so rate limiting shows up as \"no match\"",
  "file": "src/lib/osu.js",
  "line": 722,
  "severity": "high",
  "evidence": "osu.js:722-732 calls fetch directly instead of osuApiGet (osu.js:65-82). On a non-OK status it continues to the next query without attaching `.status`, so a burst of 429s ends as an empty pool and a `no-match` rejection. search/route.js:53-70 cannot map what it never sees, and the client never checks `success` (page.js:471-490, 686-703).",
  "reproduction": "Stub the search fetch to return 429: the route returns 200 with empty beatmapsets and rejection no-match, and the row says nothing was found.",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "Route the search call through osuApiGet so `.status` survives. When every query failed upstream, return a distinct error (429 mapped to a retryable message) instead of a rejection, and have the client show retryable rows as unsearched, not as no-match."
}
```

### F-10 Player section total is overwritten with the truncated count

```json
{
  "id": "F-10",
  "sources": ["PLY-01", "PLY-10"],
  "area": "player",
  "dimension": "correctness",
  "title": "loadSection replaces the profile's real count with the number fetched in the one window, and `fetched` is never read",
  "file": "src/app/page.js",
  "line": 250,
  "severity": "high",
  "evidence": "page.js:198-200 seeds the section total from the profile counts. page.js:250-265 then sets `total` to the length of the fetched window. osu.js:264-290 returns both `total` and `fetched`, and PlayerSections.js:388 renders the overwritten number. peppy's most_played shows 88 instead of 469, with no hint of truncation.",
  "reproduction": "Open userId 2, then most played: the header shows 88.",
  "confidence": "verified",
  "workstream": "matching-player",
  "fixDirection": "Keep `total` as the profile count and store `fetched` separately. Render \"88 of 469\" (or equivalent copy without dash punctuation) when fetched < total. The fetch window stays one call, per the pagination contract."
}
```

### F-11 Player routes drop isDemo and invent a bespoke 503

```json
{
  "id": "F-11",
  "sources": ["PLY-02"],
  "area": "player",
  "dimension": "correctness",
  "title": "Without credentials the player routes return a 503 or an empty success instead of `{ isDemo: true }`, so the setup guide never shows",
  "file": "src/app/api/osu/player/route.js",
  "line": 35,
  "severity": "high",
  "evidence": "player/route.js:35-47 returns a hand-written 503 when there is no token. beatmaps/route.js:24-26 and osu.js:124-132, 264-266 return empty results without `isDemo`. The search route keeps the contract, the player path does not, and the UI keys the setup guide off `isDemo`.",
  "reproduction": "Unset OSU_CLIENT_ID and search a player: an error or empty state appears, not the setup guide.",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "Have every osu!-backed function return `{ isDemo: true, ... }` when getOsuAccessToken is null, and have both player routes pass it through with 200. One shared helper for the keyless branch (X-04)."
}
```

### F-12 Every mode or status change refetches every open section

```json
{
  "id": "F-12",
  "sources": ["PLY-04", "PLY-05"],
  "area": "player",
  "dimension": "cost",
  "title": "Changing mode or status filters reloads every loaded section from osu! with no debounce, even when the request would be identical",
  "file": "src/app/page.js",
  "line": 300,
  "severity": "high",
  "evidence": "page.js:300-322 (reloadPlayerSections) runs on every filter change and calls loadSection for each open section. osu.js:244-255 and 264-284 show that only `best` takes a mode upstream; collection filters are applied after the fetch (matchesCollectionFilters). A status toggle therefore refetches data it already holds, and fast toggling multiplies calls on the shared token.",
  "reproduction": "Open three sections and toggle the status filter five times: 15 upstream calls where 0 are needed.",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "Keep the unfiltered window per section, keyed by the upstream request (type, mode when type is best). Refetch only when that key changes; otherwise re-apply matchesCollectionFilters locally. Debounce the mode control. This preserves the \"one window, filters after the fetch\" contract."
}
```

### F-13 A stale loadSection response lands in a newer player's state

```json
{
  "id": "F-13",
  "sources": ["PLY-06"],
  "area": "player",
  "dimension": "correctness",
  "title": "loadSection has no request identity, so switching players mid-load writes the old player's maps into the new profile",
  "file": "src/app/page.js",
  "line": 236,
  "severity": "high",
  "evidence": "page.js:187-205 switches profile and page.js:236-274 awaits the fetch and then writes into sections by type only. Nothing checks that the player is still the same, and nothing aborts the in-flight request.",
  "reproduction": "Open player A's most played, then immediately open player B: B's section shows A's maps once the slow request resolves.",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "Tag each request with the userId (or a generation counter held in a ref), and drop the response if it no longer matches. Abort superseded requests with AbortController."
}
```

### F-14 The fallbacks array is uncapped and fans out into upstream queries

```json
{
  "id": "F-14",
  "sources": ["MAT-06"],
  "area": "matching-api",
  "dimension": "cost",
  "title": "/api/osu/search accepts any number of fallback queries, and each becomes an osu! search call",
  "file": "src/app/api/osu/search/route.js",
  "line": 33,
  "severity": "high",
  "evidence": "search/route.js:33-40 passes `fallbacks` straight from the body into searchOsuBeatmaps, where they join queriesToRun. The only stop is the score-150 early exit. One request can burn hundreds of calls on the shared token, starving every user.",
  "reproduction": "POST a body with 200 distinct nonsense fallbacks: the loop issues up to 200 upstream searches (verify with a small n and a log, not a flood).",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "Validate the body with the shared validator (X-03): cap fallbacks (the extractor never produces more than a handful), cap string length, dedupe, and cap total queriesToRun per request in osu.js as well, so a direct caller cannot exceed what the UI ever sends. Check bench:cost is unchanged."
}
```

### F-15 The proxy's mirror walk repeats the browser mirrors with a UA they block

```json
{
  "id": "F-15",
  "sources": ["DL-03", "DL-04", "SEC-06"],
  "area": "downloads",
  "dimension": "cost",
  "title": "The proxy walks four mirrors in sequence, starting with the two the browser already failed on, and sends a User-Agent catboy rejects",
  "file": "src/app/api/download/route.js",
  "line": 84,
  "severity": "high",
  "evidence": "route.js:84-89 lists catboy and nerinyan first, the same mirrors beatmapDownload.js:19-22 already tried from the browser. route.js:106-112 sends `osu-playlist-sync/1.0 (web-app)`, which catboy answers with 403 (verified). With a 6s timeout each (route.js:101-128), a fallback can hold the function for up to 24s before reaching the mirrors that might work.",
  "reproduction": "`curl -A 'osu-playlist-sync/1.0 (web-app)' -I https://catboy.best/d/<id>` gives 403. Timing one fallback for an id missing everywhere shows about 24s of function time.",
  "confidence": "verified",
  "workstream": "downloads-cost",
  "fixDirection": "Define the mirror list once (X-11) with a per-mirror flag for CORS or proxy-only. The proxy tries only the mirrors the browser cannot reach, sends one honest UA that the mirrors accept (X-07), and shares one overall deadline under maxDuration instead of 6s times N."
}
```

### F-16 The batch Download button has no re-entrancy guard

```json
{
  "id": "F-16",
  "sources": ["DL-05"],
  "area": "downloads",
  "dimension": "cost",
  "title": "Clicking batch Download again while a batch runs starts a parallel loop, each with its own proxy-fallback budget",
  "file": "src/app/page.js",
  "line": 780,
  "severity": "high",
  "evidence": "StatsBar.js:152 renders the Download button without the disabled state that the ZIP button gets at StatsBar.js:179. page.js:780-801 has no in-flight flag, and the fallback counter is created per call at page.js:785, so N clicks give N times 5 proxy fallbacks.",
  "reproduction": "Select 20 songs whose CORS mirrors fail and click Download three times: three loops run, up to 15 proxy fallbacks.",
  "confidence": "traced",
  "workstream": "downloads-cost",
  "fixDirection": "One in-flight flag shared by batch and ZIP, which disables both buttons, and one fallback budget per session window rather than per click. The server-side cap (F-01) is the real bound; this is the client courtesy layer."
}
```

### F-17 ZIP bundling has no memory ceiling

```json
{
  "id": "F-17",
  "sources": ["DL-06"],
  "area": "downloads",
  "dimension": "robustness",
  "title": "The ZIP path holds every archive blob plus the generated ZIP in memory with no size limit",
  "file": "src/app/page.js",
  "line": 804,
  "severity": "high",
  "evidence": "page.js:804-858 fetches every selected set into JSZip (811, 824) and then generates the whole ZIP (844). beatmapDownload.js:73-81 reads full blobs. 200 sets at 10-30 MB each crash the tab on mobile, and the user loses the whole batch. JSZip is also imported statically at page.js:21, so every visitor downloads it.",
  "reproduction": "Select 200 songs and choose ZIP on a phone: the tab reloads before the ZIP is saved.",
  "confidence": "traced",
  "workstream": "downloads-cost",
  "fixDirection": "Cap the ZIP by running byte total (checked as blobs arrive) and split into multiple ZIPs, or refuse with a message, above the cap. Use `generateAsync({ streamFiles: true })`. Lazy-load JSZip with a dynamic import inside the handler."
}
```

### F-18 YouTube silently undercounts playlists

```json
{
  "id": "F-18",
  "sources": ["EXT-04", "EXT-05"],
  "area": "extraction",
  "dimension": "correctness",
  "title": "The Innertube path ignores continuations and silently filters unavailable videos, so long playlists come back truncated with no notice",
  "file": "src/lib/youtube.js",
  "line": 147,
  "severity": "high",
  "evidence": "youtube.js:94-265 never follows continuation tokens, so only the first page (about 100) of a playlist is returned. youtube.js:147, 171, 229 and 247 drop items titled \"Private video\" or \"Deleted video\" by literal string comparison. Neither drop is reported, so the user cannot tell the list is short.",
  "reproduction": "Paste a 300-video playlist: about 100 rows, no message.",
  "confidence": "traced",
  "workstream": "server-hardening",
  "fixDirection": "Follow continuations up to a stated cap, return `totalCount`, `returnedCount` and `unavailableCount`, and show \"Showing N of M\" in the UI. Detect unavailable items structurally (missing lengthSeconds or isPlayable false) instead of comparing titles, so a localised or renamed label does not bypass the rule."
}
```

### F-19 Every search completion re-renders every row

```json
{
  "id": "F-19",
  "sources": ["UI-01", "MAT-11"],
  "area": "client-ui",
  "dimension": "performance",
  "title": "No row is memoized and each search completion maps the whole songs array, so N searches cause N full-table renders",
  "file": "src/app/page.js",
  "line": 460,
  "severity": "medium",
  "evidence": "page.js:460-499 (searchTargetSongs) calls `setSongs(prev => prev.map(...))` once per completed song, with the same pattern at 686 and 708. SongTable, SongRow and SongCardMobile are plain components. Handlers are recreated every render, so memoization alone would not help. The only memo in the codebase is HitCircleEaster.js. Severity changed: high to medium: bounded to the rows on the current page, with no wrong result and no billed cost.",
  "reproduction": "React profiler during a 50-track search: about 50 commits, each rendering every visible row.",
  "confidence": "verified",
  "workstream": "client-ui",
  "fixDirection": "`React.memo` on SongRow and SongCardMobile, with stable callbacks (a ref-backed wrapper at the prop sites, so handler bodies owned by other workstreams are untouched). Optionally batch completions per animation frame. The songs shape is unchanged."
}
```

### F-20 Player sections render and load every image at once

```json
{
  "id": "F-20",
  "sources": ["UI-03", "PLY-07"],
  "area": "client-ui",
  "dimension": "performance",
  "title": "Player sections render all fetched rows unvirtualized with eager cover images, and PlayerResults avatars load eagerly too",
  "file": "src/components/PlayerSections.js",
  "line": 470,
  "severity": "medium",
  "evidence": "PlayerSections.js:470-486 maps every item, and PlayerSections.js:144-155 renders cover images with no `loading=\"lazy\"`. PlayerResults avatars are the same. Opening four sections starts up to 400 image requests. Severity changed: high to medium: bounded at 100 rows per section by the one-window fetch, and image bandwidth goes to the osu! CDN, not billed to us.",
  "reproduction": "Open a profile and expand all sections: the Network tab shows hundreds of image requests before any scroll.",
  "confidence": "verified",
  "workstream": "client-ui",
  "fixDirection": "`loading=\"lazy\"` and `decoding=\"async\"` with explicit width and height on every cover and avatar. Render the first page of a section and reveal more locally (the data is already in memory, so no extra fetch)."
}
```

### F-21 Audio preview outlives its row and has no loading or error state

```json
{
  "id": "F-21",
  "sources": ["UI-05"],
  "area": "client-ui",
  "dimension": "correctness",
  "title": "Changing page, filter or list leaves a preview playing with no visible control, and a failed preview fails silently",
  "file": "src/components/SongTable.js",
  "line": 47,
  "severity": "medium",
  "evidence": "SongTable.js:47-50 and PlayerSections.js:326 hold the Audio object in component state with no cleanup when the owning row unmounts, and no `error` or `waiting` handling. Severity changed: high to medium: osu! previews are short clips, so orphaned audio stops by itself, and nothing is lost.",
  "reproduction": "Start a preview, then go to page 2: it keeps playing, with no button to stop it.",
  "confidence": "traced",
  "workstream": "client-ui",
  "fixDirection": "One `useAudioPreview` hook (X-10 and F-36) that owns a single Audio element app-wide, stops on unmount and on list change, and exposes loading and error states that both row components render."
}
```

### F-22 userId is interpolated into osu! API paths unencoded

```json
{
  "id": "F-22",
  "sources": ["SEC-02"],
  "area": "platform-security",
  "dimension": "security",
  "title": "The beatmaps route puts the raw userId query param into the upstream path, allowing path traversal within the osu! API",
  "file": "src/lib/osu.js",
  "line": 272,
  "severity": "medium",
  "evidence": "beatmaps/route.js:10 reads userId unvalidated, and osu.js:272-274 builds `/users/${userId}/beatmapsets/...` with no encoding, unlike osu.js:143-144 which encodes. `userId=2/../../beatmapsets/search?q=x` reaches other endpoints with the app's token. Severity changed: high to medium: the client-credentials token has public read scope only and the path cannot leave osu.ppy.sh, so the exposure is quota abuse rather than data access.",
  "reproduction": "`curl \"http://localhost:3000/api/osu/player/beatmaps?userId=2%2F..%2F..%2Fme&type=best\"`: the upstream request path changes.",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "Validate userId as a positive integer in the shared validator (X-03) and 400 otherwise. Also `encodeURIComponent` inside osu.js as a second layer."
}
```

### F-23 next 14.2.35 has open advisories, plus a transitive postcss advisory

```json
{
  "id": "F-23",
  "sources": ["SEC-08"],
  "area": "platform-security",
  "dimension": "security",
  "title": "The pinned next@14.2.35 and its postcss carry published advisories",
  "file": "package.json",
  "line": 20,
  "severity": "medium",
  "evidence": "package.json:20 pins next 14.2.35, and `npm audit` lists advisories for it and a transitive postcss. The auditor's own analysis found that the affected features (Server Actions, rewrites, middleware bypass, custom server) are not used today. Severity changed: high to medium: not exploitable in the current configuration, although adding middleware (X-01) changes that for the middleware-bypass class, so the upgrade must precede or accompany it.",
  "reproduction": "`npm audit --omit=dev`.",
  "confidence": "verified",
  "workstream": "server-hardening",
  "fixDirection": "Take the newest patched release of the current major first, if one clears the advisories. A jump to the next major is an isolated last step with its own full inventory check, and may be deferred (see D-06)."
}
```

### F-24 beatmapsetId is not validated before hitting mirrors

```json
{
  "id": "F-24",
  "sources": ["DL-09"],
  "area": "downloads",
  "dimension": "security",
  "title": "The download route interpolates any beatmapsetId string into mirror URLs and the Content-Disposition header",
  "file": "src/app/api/download/route.js",
  "line": 73,
  "severity": "medium",
  "evidence": "route.js:73 reads the param, and route.js:85-88 builds mirror URLs from it without a numeric check, so `1/../../x` or `1?x=` reaches mirror paths and every non-numeric value still costs up to four upstream attempts and a generated placeholder.",
  "reproduction": "`curl -I \"http://localhost:3000/api/download?beatmapsetId=abc\"`: 200 with a placeholder archive.",
  "confidence": "traced",
  "workstream": "downloads-cost",
  "fixDirection": "400 unless the id matches `^[1-9][0-9]{0,9}$`, via the shared validator (X-03), before any mirror is contacted."
}
```

### F-25 No security headers

```json
{
  "id": "F-25",
  "sources": ["SEC-07"],
  "area": "platform-security",
  "dimension": "security",
  "title": "next.config.mjs sets no CSP, frame, referrer or content-type-options headers",
  "file": "next.config.mjs",
  "line": 1,
  "severity": "medium",
  "evidence": "next.config.mjs:1 is an empty config. The app renders third-party titles and fetches from several mirrors in the browser, with no CSP to bound either.",
  "reproduction": "`curl -I http://localhost:3000/`: none of Content-Security-Policy, X-Frame-Options/frame-ancestors, Referrer-Policy or X-Content-Type-Options.",
  "confidence": "verified",
  "workstream": "server-hardening",
  "fixDirection": "Add `headers()` with a CSP whose connect-src and img-src list the osu! CDN, the image hosts and the CORS mirrors the browser fetches directly (derived from the one mirror list, X-11). Also frame-ancestors 'none', nosniff, and strict-origin-when-cross-origin. Start in report-only if unsure."
}
```

### F-26 Extractor fetches have no timeout and no body cap

```json
{
  "id": "F-26",
  "sources": ["EXT-12", "EXT-13"],
  "area": "extraction",
  "dimension": "robustness",
  "title": "Spotify, Apple and YouTube fetches can hang the function until platform timeout and read unbounded bodies",
  "file": "src/lib/extractors.js",
  "line": 20,
  "severity": "medium",
  "evidence": "extractors.js:20, 39, 47, 78, 87 and 148, and the Innertube calls in youtube.js, use bare fetch with no AbortSignal and `await res.text()` with no size limit. A slow or huge provider response holds the function for its full duration.",
  "reproduction": "Point the extractor at a slow endpoint (a local stub that never finishes): the route hangs until the platform kills it.",
  "confidence": "traced",
  "workstream": "server-hardening",
  "fixDirection": "Use the shared fetch helper (X-02): a default timeout, a max body size enforced while reading, and one UA policy. No per-call-site constants."
}
```

### F-27 Appended playlists are not deduplicated

```json
{
  "id": "F-27",
  "sources": ["EXT-07"],
  "area": "extraction",
  "dimension": "correctness",
  "title": "Pasting a second playlist concatenates it, so overlapping tracks appear twice and are searched and downloaded twice",
  "file": "src/app/page.js",
  "line": 375,
  "severity": "medium",
  "evidence": "page.js:375 builds `isAppending ? [...songs, ...newSongs] : newSongs`, while a dedupe helper already exists (mergeSongs, page.js:226-233) for the player path. Appending is the intended multi-playlist queue (C1), so only the dedupe is missing.",
  "reproduction": "Paste the same playlist twice: every track appears twice.",
  "confidence": "traced",
  "workstream": "server-hardening",
  "fixDirection": "Append through the same song-identity function the player path uses (X-09, `src/lib/song.js`), keyed on the normalised source id or on artist and title, not on a list of special cases. Keep the append behaviour itself."
}
```

### F-28 The "Artist - Title" splitter runs on structured sources too

```json
{
  "id": "F-28",
  "sources": ["EXT-09"],
  "area": "extraction",
  "dimension": "correctness",
  "title": "cleanSongTitle splits on \" - \" even for Spotify and Apple titles, which already carry a real artist field",
  "file": "src/lib/titleCleaner.js",
  "line": 186,
  "severity": "medium",
  "evidence": "titleCleaner.js:186 applies the dash splitter unconditionally. A Spotify title like \"Song - Remastered 2011\" or \"Song - From X\" becomes artist \"Song\", title \"Remastered 2011\", which overrides the trusted structured artist in the query.",
  "reproduction": "Run cleanSongTitle on a Spotify track titled \"Here Comes the Sun - Remastered 2019\" with artist \"The Beatles\": the extracted artist is not The Beatles.",
  "confidence": "traced",
  "workstream": "server-hardening",
  "fixDirection": "Pass `source` into cleanSongTitle and only split when the source has no structured artist (youtube, query). This is a general rule keyed on source, not a list of suffixes. Requires bench before and after, and `source` populated on every path (F-32)."
}
```

### F-29 The score-150 early exit fires before low trust is resolved

```json
{
  "id": "F-29",
  "sources": ["MAT-05"],
  "area": "matching-api",
  "dimension": "correctness",
  "title": "searchOsuBeatmaps stops at the first score of 150 or more even when the artist trust is still unresolved",
  "file": "src/lib/osu.js",
  "line": 757,
  "severity": "medium",
  "evidence": "osu.js:691 defines the exit, osu.js:757 takes it, and osu.js:767-782 resolves low-confidence trust only afterwards. A title plus unverified-artist score can end the loop before the pool that could verify or refute the artist has been gathered.",
  "reproduction": "Bench fixtures with a non-structured source whose first query hits a same-title set by another artist (trace through osu.js:757 with a logged verdict).",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "Allow the early exit only when trust is already high, or the leading candidate's verdict is SAME. Needs bench and bench:cost: the change must not push calls per track above 1.49 or drop hit below 31."
}
```

### F-30 Two different "ranked" status sets

```json
{
  "id": "F-30",
  "sources": ["MAT-07", "PLY-09"],
  "area": "matching-api",
  "dimension": "correctness",
  "title": "osu.js RANKED_STATUSES and beatmapFormat.js RANKED_AND_LOVED disagree, so the same filter keeps different sets on search and player paths",
  "file": "src/lib/osu.js",
  "line": 237,
  "severity": "medium",
  "evidence": "osu.js:237 defines RANKED_STATUSES including approved. beatmapFormat.js:35 defines RANKED_AND_LOVED with a different membership. The search path, the collection filter and narrowMatchesToRanked each pick one of them.",
  "reproduction": "An approved set passes the player filter but is dropped by the search filter, or the reverse (node check of both sets).",
  "confidence": "verified",
  "workstream": "matching-player",
  "fixDirection": "One exported constant in beatmapFormat.js, imported by osu.js and page.js. osu! treats ranked, approved, qualified and loved as having a leaderboard. Decide the membership once, with the F-08 capture, and do not add statuses to a per-path list."
}
```

### F-31 The beatmaps route maps every error to 500 and leaks the upstream path

```json
{
  "id": "F-31",
  "sources": ["PLY-03"],
  "area": "player",
  "dimension": "correctness",
  "title": "/api/osu/player/beatmaps turns 404 and other upstream errors into 500 with the raw osu! path in the message",
  "file": "src/app/api/osu/player/beatmaps/route.js",
  "line": 27,
  "severity": "medium",
  "evidence": "beatmaps/route.js:27-38 handles only 429 and returns `error.message` (which contains the upstream URL) with 500 for everything else. player/route.js:6-16 already maps 404 and 429 to plain messages.",
  "reproduction": "`curl \"http://localhost:3000/api/osu/player/beatmaps?userId=999999999999&type=best\"`: 500 with an osu.ppy.sh path in the body.",
  "confidence": "verified",
  "workstream": "matching-player",
  "fixDirection": "One shared error mapper (X-05) used by every osu! route: 404 to not found, 429 to try again shortly, anything else to a generic message, with no upstream detail in the body."
}
```

### F-32 beatmapToSong omits source and other song-contract fields

```json
{
  "id": "F-32",
  "sources": ["PLY-08"],
  "area": "player",
  "dimension": "contract",
  "title": "The player adapter builds songs without `source`, `rejection` or query fields, so the two entry paths are not identical",
  "file": "src/app/page.js",
  "line": 34,
  "severity": "medium",
  "evidence": "page.js:34-46 (beatmapToSong) and page.js:56 (blankMatchState) do not set `source`, `rejection`, `cleanQuery`, `fallbacks` or `queries`. A player song that is re-searched (manual search, strictness rematch) reaches /api/osu/search with no source, so the trust decision differs from a playlist song with the same data.",
  "reproduction": "Load a player section, then rematch a row: the request has `source` undefined.",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "Build both paths through one song constructor in `src/lib/song.js` that fills every field. For player songs, `source` should say the artist came from the osu! set itself; check how osu.js treats that value (see D-07) before choosing."
}
```

### F-33 artist-unknown is checked before the title-salvage branch

```json
{
  "id": "F-33",
  "sources": ["MAT-04"],
  "area": "matching-api",
  "dimension": "correctness",
  "title": "When trust is none, the empty-results branch reports artist-unknown before trying the title salvage",
  "file": "src/lib/osu.js",
  "line": 823,
  "severity": "medium",
  "evidence": "osu.js:823-825 tests `artistConfidence === 'none' && targetArtist` before `titleMatches.length > 0`. Settled in C2: under none trust nothing is gated, so a title with similarity of 0.92 or more normally already scores above minScore 70 and is in `formatted`. The branch is reached only when mode or status filters or maxArtistRung removed those candidates. Severity changed: high to medium: real, but reachable only on a narrow filtered path.",
  "reproduction": "A query-source song with an artist string judged none, a near-exact title, and a status filter that removes the only exact set: the result is artist-unknown with no results.",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "See D-01. Reorder only if the salvaged results are shown without the \"Could not find one by X\" notice, because under none trust X is not an artist. Needs bench."
}
```

### F-34 The last-resort window.open reopens the mirror that already failed

```json
{
  "id": "F-34",
  "sources": ["DL-10"],
  "area": "downloads",
  "dimension": "correctness",
  "title": "When a single download fails, the fallback opens a new tab on catboy, the first mirror already tried",
  "file": "src/app/page.js",
  "line": 760,
  "severity": "medium",
  "evidence": "page.js:760-766 opens `https://catboy.best/d/<id>` after fetchBeatmapArchive has already failed on catboy (beatmapDownload.js:19-22).",
  "reproduction": "Download a set missing on catboy: a new tab opens on a catboy 404.",
  "confidence": "traced",
  "workstream": "downloads-cost",
  "fixDirection": "Open the osu! beatmapset page (always valid) or the first mirror not yet tried, built from the one mirror list (X-11). Show the failure in the toast either way."
}
```

### F-35 Desktop and mobile trees are both always mounted

```json
{
  "id": "F-35",
  "sources": ["UI-02"],
  "area": "client-ui",
  "dimension": "performance",
  "title": "SongTable renders both the desktop rows and the mobile cards and hides one with CSS, doubling DOM, renders and image requests",
  "file": "src/components/SongTable.js",
  "line": 219,
  "severity": "medium",
  "evidence": "SongTable.js:219-253 renders SongRow and SongCardMobile for every song. globals.css:250-268 hides one set with media queries. Both trees render on every update (F-19) and both request thumbnails.",
  "reproduction": "Inspect the DOM at any width: two elements per song, and the Network tab shows each thumbnail requested by both.",
  "confidence": "traced",
  "workstream": "client-ui",
  "fixDirection": "Prefer `loading=\"lazy\"` images, since hidden `display:none` images are then not fetched, plus memoized rows. Conditional JS rendering by width risks a hydration mismatch and a mobile layout flash (D-08); if used, gate it behind a mounted flag with the CSS as the default."
}
```

### F-36 Audio preview is implemented twice

```json
{
  "id": "F-36",
  "sources": ["UI-04"],
  "area": "client-ui",
  "dimension": "duplication",
  "title": "SongTable and PlayerSections each carry their own preview state machine, so two previews can play at once",
  "file": "src/components/SongTable.js",
  "line": 29,
  "severity": "medium",
  "evidence": "SongTable.js:29-62 and PlayerSections.js:313-333 each create and toggle their own Audio object, with slightly different stop rules. Starting one does not stop the other.",
  "reproduction": "With both lists visible, start a preview in each: both play.",
  "confidence": "traced",
  "workstream": "client-ui",
  "fixDirection": "A single `useAudioPreview` hook with one shared Audio element, used by SongRow, SongCardMobile and BeatmapRow (together with F-21)."
}
```

### F-37 Dead downloadUrl field on every formatted beatmapset

```json
{
  "id": "F-37",
  "sources": ["MAT-08", "DL-07", "SEC-11"],
  "area": "matching-api",
  "dimension": "cleanup",
  "title": "osu.js attaches a downloadUrl that no caller reads, which is a third hardcoded mirror URL",
  "file": "src/lib/osu.js",
  "line": 905,
  "severity": "low",
  "evidence": "osu.js:905 sets downloadUrl on every formatted set. No component or download path reads it; the download code builds its own URLs (beatmapDownload.js:19-22, 31).",
  "reproduction": "Search the source for `downloadUrl` readers: none.",
  "confidence": "verified",
  "workstream": "matching-player",
  "fixDirection": "Delete it. The mirror list lives only in the one module from X-11."
}
```

### F-38 Filename sanitising is duplicated and inconsistent

```json
{
  "id": "F-38",
  "sources": ["DL-08", "SEC-10"],
  "area": "downloads",
  "dimension": "duplication",
  "title": "Four sanitisers for .osz names across page.js and the download route, with different rules",
  "file": "src/app/page.js",
  "line": 752,
  "severity": "low",
  "evidence": "page.js:752, 819 and 848, route.js:130 (Content-Disposition), and generateFallbackOsz at route.js:11-12 and 63 each strip characters differently. One allows characters another rejects, so the same set gets different names on different paths.",
  "reproduction": "A title containing `:` or `\"`: single and ZIP downloads produce different file names.",
  "confidence": "verified",
  "workstream": "downloads-cost",
  "fixDirection": "One `sanitizeFilename` in `src/lib/filename.js`, used by both client and route, including RFC 5987 `filename*` in Content-Disposition."
}
```

### F-39 artistProbeCache is unbounded

```json
{
  "id": "F-39",
  "sources": ["MAT-09"],
  "area": "matching-api",
  "dimension": "robustness",
  "title": "The module-level probe cache grows forever in a warm instance",
  "file": "src/lib/osu.js",
  "line": 539,
  "severity": "low",
  "evidence": "osu.js:539 declares a Map, and osu.js:585, 600 and 604 add to it with no eviction or TTL. Severity changed: medium to low: entries are a few bytes each and serverless instances are short-lived, so growth is bounded in practice.",
  "reproduction": "Not practically observable. Trace only.",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "Cap it with an LRU of a fixed size and a TTL. Do not change the probe logic (bench:cost must stay at 1.49 per track)."
}
```

### F-40 The query-variant loop is sequential

```json
{
  "id": "F-40",
  "sources": ["MAT-10"],
  "area": "matching-api",
  "dimension": "performance",
  "title": "searchOsuBeatmaps awaits each query variant in turn",
  "file": "src/lib/osu.js",
  "line": 722,
  "severity": "low",
  "evidence": "osu.js:722 runs the variants one after another. Latency adds up per variant.",
  "reproduction": "Time a search that runs three variants.",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "See D-04: sequential order is what makes the early exit save calls. Leave as is unless bench:cost proves a parallel scheme stays at 1.49 calls per track or fewer."
}
```

### F-41 Two beatmapset dedupe mechanisms in osu.js

```json
{
  "id": "F-41",
  "sources": ["PLY-11"],
  "area": "player",
  "dimension": "duplication",
  "title": "Collection dedupe (osu.js:193-235) and search pooling dedupe (osu.js:671 onward) are separate implementations",
  "file": "src/lib/osu.js",
  "line": 193,
  "severity": "low",
  "evidence": "osu.js:193-235 dedupes collection items by set id, and the search pool from osu.js:671 onward dedupes candidates by set id with score merging.",
  "reproduction": "Code inspection.",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "See D-05: the inputs differ (collection items wrap a beatmapset; search candidates carry scores), so at most share a `beatmapsetKey` helper. Do not force one abstraction."
}
```

### F-42 The object URL is revoked synchronously after click

```json
{
  "id": "F-42",
  "sources": ["DL-11"],
  "area": "downloads",
  "dimension": "robustness",
  "title": "downloadBlob revokes the object URL right after `a.click()`, which can cancel the save in some browsers",
  "file": "src/app/page.js",
  "line": 65,
  "severity": "low",
  "evidence": "page.js:65-75 calls `URL.revokeObjectURL` on the same tick as the click. Safari and some mobile browsers begin reading the URL asynchronously.",
  "reproduction": "iOS Safari: a single download sometimes saves nothing.",
  "confidence": "traced",
  "workstream": "downloads-cost",
  "fixDirection": "Revoke in a `setTimeout` of a few seconds, or on the next focus."
}
```

### F-43 Batch pacing is a fixed delay

```json
{
  "id": "F-43",
  "sources": ["DL-13"],
  "area": "downloads",
  "dimension": "robustness",
  "title": "Batch and ZIP loops sleep a fixed interval between items whatever the mirror responds",
  "file": "src/app/page.js",
  "line": 789,
  "severity": "low",
  "evidence": "page.js:789 and 836 wait a constant between downloads and ignore Retry-After or 429 from the mirrors.",
  "reproduction": "Batch 50 on a mirror returning 429: the loop keeps its pace and each item then fails over to the proxy.",
  "confidence": "traced",
  "workstream": "downloads-cost",
  "fixDirection": "Back off on 429 or Retry-After in fetchBeatmapArchive, so every caller gets it once."
}
```

### F-44 No way to cancel a running batch or ZIP

```json
{
  "id": "F-44",
  "sources": ["DL-14"],
  "area": "downloads",
  "dimension": "ux",
  "title": "Once started, a batch or ZIP runs to the end",
  "file": "src/app/page.js",
  "line": 780,
  "severity": "low",
  "evidence": "page.js:780-858 has no abort path, and DownloadToast shows progress only.",
  "reproduction": "Start a 100-song ZIP: there is no cancel control.",
  "confidence": "traced",
  "workstream": "downloads-cost",
  "fixDirection": "An AbortController held with the in-flight flag from F-16, plus a Cancel control in DownloadToast (copy without dash punctuation)."
}
```

### F-45 Song id is generated twice

```json
{
  "id": "F-45",
  "sources": ["EXT-08"],
  "area": "extraction",
  "dimension": "cleanup",
  "title": "extractors.js assigns an id, then page.js overwrites it",
  "file": "src/lib/extractors.js",
  "line": 240,
  "severity": "low",
  "evidence": "extractors.js:240 builds an id, and page.js:370 replaces it when songs are created.",
  "reproduction": "Compare ids in the /api/playlist response and in page state.",
  "confidence": "verified",
  "workstream": "server-hardening",
  "fixDirection": "Generate the id once, in the shared song constructor (`src/lib/song.js`, X-09), and make it stable across appends so F-27 dedupe can use it."
}
```

### F-46 BRACKET_NOISE_TERMS is a growing list

```json
{
  "id": "F-46",
  "sources": ["EXT-10"],
  "area": "extraction",
  "dimension": "maintainability",
  "title": "titleCleaner strips bracketed noise by a hand-maintained term list",
  "file": "src/lib/titleCleaner.js",
  "line": 7,
  "severity": "low",
  "evidence": "titleCleaner.js:7 enumerates terms. Each new noise token needs a list edit, which is exactly the per-item special-casing the project rules forbid.",
  "reproduction": "A title with an unlisted bracket tag keeps the tag in the query.",
  "confidence": "traced",
  "workstream": "server-hardening",
  "fixDirection": "Prefer a structural rule (drop bracketed segments when the remainder still has at least N letters, and keep them as a fallback query) over growing the list. Recall only: measure with bench and the cleaned-query diff before and after."
}
```

### F-47 Platform detection is duplicated between client and server

```json
{
  "id": "F-47",
  "sources": ["EXT-11"],
  "area": "extraction",
  "dimension": "duplication",
  "title": "PlaylistInput.detectPlatform and extractors.js each detect the provider, with the same substring style",
  "file": "src/components/PlaylistInput.js",
  "line": 147,
  "severity": "low",
  "evidence": "PlaylistInput.js:147-158 and extractors.js:177-199 each classify URLs.",
  "reproduction": "Code inspection. A URL the client labels Apple is rejected or misrouted server side after F-02.",
  "confidence": "verified",
  "workstream": "server-hardening",
  "fixDirection": "Both import the hostname allowlist from `src/lib/platform.js` (F-02)."
}
```

### F-48 Songs accumulate across entry paths

```json
{
  "id": "F-48",
  "sources": ["UI-07"],
  "area": "client-ui",
  "dimension": "correctness",
  "title": "Songs from one entry path persist when the user switches to another",
  "file": "src/app/page.js",
  "line": 335,
  "severity": "low",
  "evidence": "Settled in C1. A paste appends only when songs exist and no player profile is loaded (page.js:128, 335, 375), which is the intended multi-playlist queue. Player search and profile paths already clear songs (page.js:149, 191), as do reload (303) and clear-player (326). The suggested scoped reset already exists. The remaining gap is only that the append is silent. Severity changed: medium to low: the suggested fix already exists, and the rest is a missing notice.",
  "reproduction": "Paste playlist A, then playlist B: both lists are shown, with no indication that B was appended.",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "No reset change. Show \"Added N songs\" on append (shared with the F-07 badge fix) and dedupe (F-27)."
}
```

### F-49 BeatmapRow can show the artistOverride mark without its notice

```json
{
  "id": "F-49",
  "sources": ["UI-06"],
  "area": "client-ui",
  "dimension": "contract",
  "title": "BeatmapRow renders an override mark with no \"Could not find one by\" notice",
  "file": "src/components/PlayerSections.js",
  "line": 123,
  "severity": "low",
  "evidence": "PlayerSections.js:123-130 renders the artistOverride mark alone. It is unreachable today, because player sets are never gated, but it breaks the \"mark always paired with notice\" contract the moment it becomes reachable.",
  "reproduction": "Not reachable today. Trace only.",
  "confidence": "traced",
  "workstream": "client-ui",
  "fixDirection": "Render mark and notice from one shared piece (X-10), or remove the mark from BeatmapRow."
}
```

### F-50 GitHub commits cache is per instance

```json
{
  "id": "F-50",
  "sources": ["SEC-09"],
  "area": "platform-security",
  "dimension": "cost",
  "title": "The commits route caches in module memory, so each cold instance hits the GitHub API again",
  "file": "src/app/api/github/commits/route.js",
  "line": 27,
  "severity": "low",
  "evidence": "github/commits/route.js:27 keeps a module-level cache. Unauthenticated GitHub allows 60 requests per hour per IP, shared by all instances on one egress IP.",
  "reproduction": "Trace only.",
  "confidence": "traced",
  "workstream": "server-hardening",
  "fixDirection": "Send `Cache-Control: s-maxage=...` so the CDN caches the response, and keep the memory cache as a second layer. The rate-limit middleware (X-01) covers direct abuse."
}
```

## Cross-area findings

### X-01 No shared rate limiting on any route

```json
{
  "id": "X-01",
  "sources": ["SEC-03", "DL-01", "MAT-06", "PLY-05"],
  "area": "platform-security",
  "dimension": "cost",
  "title": "No route has per-client rate limiting, and every osu!-backed route spends one shared app token",
  "file": "src/lib/osu.js",
  "line": 8,
  "severity": "high",
  "evidence": "SEC-03: no middleware and no per-route limiter. osu.js:8-9 hold one token singleton that every visitor's requests spend. The consequences are split across areas: an uncapped proxy (F-01, route.js:70-166), uncapped fallbacks fanning out into searches (F-14, search/route.js:33-40), and filter-change refetch storms (F-12, page.js:300-322). One abusive client makes osu! rate-limit the token, and then every user sees 429s, which also surface as false no-match (F-09). Severity changed: critical to high: the billed-bytes half is F-01 (critical). What remains is quota exhaustion on osu!'s side, which is a significant cost but bounded by osu!'s own limit, not by our bill.",
  "reproduction": "Loop /api/osu/search requests from one IP: all are served until osu! returns 429, after which searches for every user report no-match.",
  "confidence": "traced",
  "workstream": "server-hardening",
  "fixDirection": "One `src/middleware.js` limiter on `/api/*` with per-route budgets (download strictest, then search, then player). It uses a shared store when one is configured, and per-instance memory otherwise, so it stays zero-key and never crashes. Must land with or after the Next patch (F-23)."
}
```

### X-02 No shared fetch helper with a timeout and a size cap

```json
{
  "id": "X-02",
  "sources": ["EXT-12", "EXT-13", "DL-03", "MAT-03"],
  "area": "platform-security",
  "dimension": "robustness",
  "title": "Every module hand-rolls outbound fetches, with different or no timeouts, no body limits and inconsistent status handling",
  "file": "src/lib/extractors.js",
  "line": 20,
  "severity": "medium",
  "evidence": "Timeouts: extractors.js:20-148 and youtube.js have none. The download route builds its own 6s AbortController per mirror (route.js:101-128). osu.js has osuApiGet (osu.js:65-82), which attaches `.status`, but the search loop bypasses it with a raw fetch (osu.js:722). beatmapDownload.js fetchBlob has its own timeout in the browser. No server fetch caps the body size.",
  "reproduction": "See F-26 (hang), F-09 (status lost) and F-01 (unbounded body).",
  "confidence": "traced",
  "workstream": "server-hardening",
  "fixDirection": "`src/lib/http.js`: `fetchWithLimits(url, { timeoutMs, maxBytes, ua })`, which returns or throws with `.status` and enforces maxBytes while streaming. Server-side callers use it: extractors, youtube, the download route and osuApiGet. The browser helper keeps its own timeout, since it runs client-side."
}
```

### X-03 No shared input validation

```json
{
  "id": "X-03",
  "sources": ["SEC-02", "DL-09", "MAT-06", "EXT-01"],
  "area": "platform-security",
  "dimension": "security",
  "title": "Each route trusts its query and body params, and the checks that do exist are per-site",
  "file": "src/app/api/osu/player/beatmaps/route.js",
  "line": 10,
  "severity": "medium",
  "evidence": "userId is unvalidated (beatmaps/route.js:10, osu.js:272-274), beatmapsetId is unvalidated (download/route.js:73), fallbacks are unbounded (search/route.js:33-40), and the playlist URL is checked by substring (extractors.js:188). Four routes, four different gaps.",
  "reproduction": "See F-22, F-24, F-14 and F-02.",
  "confidence": "traced",
  "workstream": "server-hardening",
  "fixDirection": "`src/lib/validate.js` with a few typed validators (positive int id, bounded string, bounded string array, allowlisted https URL), each returning a 400 on failure. Every route validates at the top, before any fetch."
}
```

### X-04 The isDemo contract means different things on different routes

```json
{
  "id": "X-04",
  "sources": ["PLY-02", "EXT-03", "EXT-06"],
  "area": "matching-api",
  "dimension": "contract",
  "title": "isDemo is returned by search, dropped by player routes, replaced by a 503 on the profile route, and reused by /api/playlist for YouTube failure",
  "file": "src/app/api/osu/player/route.js",
  "line": 35,
  "severity": "medium",
  "evidence": "The search route returns `{ isDemo: true }` without credentials (verified by execution in 1-matching-api). player/route.js:35-47 returns a 503 instead, and beatmaps/route.js:24-26 returns empty results without the flag (F-11). /api/playlist sets isDemo when YouTube extraction fails (youtube.js:88, 267), which page.js:1000 then shows as the same badge, but only on replace (page.js:356-364). One flag carries two meanings, and neither is delivered consistently. Settled in C3.",
  "reproduction": "Without credentials: search shows the setup guide, but player search shows an error. With credentials and a broken YouTube URL, a demo badge appears (on replace) that has nothing to do with osu! setup.",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "`isDemo` means only \"no osu! credentials\", and every osu! route returns it with 200 through one helper. Extraction failure is an error (F-07), not a demo."
}
```

### X-05 Error mapping differs per route, and the client ignores success

```json
{
  "id": "X-05",
  "sources": ["PLY-03", "MAT-03"],
  "area": "matching-api",
  "dimension": "contract",
  "title": "Each route maps upstream errors its own way, and the client never checks the success flag it is sent",
  "file": "src/app/api/osu/player/beatmaps/route.js",
  "line": 27,
  "severity": "medium",
  "evidence": "player/route.js:6-16 maps 404 and 429. beatmaps/route.js:27-38 maps only 429 and leaks the message (F-31). search/route.js:53-70 cannot see upstream status (F-09). The playlist route has its own messages. On the client, page.js:471-490 and 686-703 read results without checking `success` or the status code.",
  "reproduction": "See F-31 and F-09.",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "One `toRouteError(err)` in the shared http lib, keyed on `.status` (the osuApiGet convention), used by every route. The client treats `!res.ok || !data.success` as retryable and never as no-match."
}
```

### X-06 Status semantics are spread across four places

```json
{
  "id": "X-06",
  "sources": ["MAT-02", "MAT-07", "PLY-09"],
  "area": "matching-api",
  "dimension": "duplication",
  "title": "Which statuses count as \"ranked\" is decided separately by the upstream param, two constants and the page",
  "file": "src/lib/beatmapFormat.js",
  "line": 35,
  "severity": "medium",
  "evidence": "The upstream `s=ranked` at osu.js:719, RANKED_STATUSES at osu.js:237, RANKED_AND_LOVED at beatmapFormat.js:35, and narrowMatchesToRanked in page.js (408-735 range) each encode the rule. F-08 and F-30 are two symptoms of this one root.",
  "reproduction": "See F-08 and F-30.",
  "confidence": "verified",
  "workstream": "matching-player",
  "fixDirection": "One exported status set and one `upstreamStatusFor(filter)` function next to it. Every layer imports them."
}
```

### X-07 Outbound User-Agent policy is inconsistent

```json
{
  "id": "X-07",
  "sources": ["DL-04"],
  "area": "downloads",
  "dimension": "robustness",
  "title": "The download proxy sends a custom UA that catboy blocks, extractors send a browser UA, and nothing is defined in one place",
  "file": "src/app/api/download/route.js",
  "line": 108,
  "severity": "medium",
  "evidence": "route.js:108 sends `osu-playlist-sync/1.0 (web-app)` and gets 403 from catboy (verified, DL-04). The extractors send hardcoded browser UA strings, which these scrapers need. The browser download path sends the visitor's own UA. The strings are scattered and chosen per call site.",
  "reproduction": "`curl -A 'osu-playlist-sync/1.0 (web-app)' -I https://catboy.best/d/<id>` gives 403.",
  "confidence": "verified",
  "workstream": "server-hardening",
  "fixDirection": "Named UA profiles in `src/lib/http.js` (scraper, mirror, osu-api), picked by the caller. Pick the mirror UA by testing it against each mirror once, not by special-casing catboy."
}
```

### X-08 Search requests are built two different ways

```json
{
  "id": "X-08",
  "sources": ["MAT-01"],
  "area": "matching-api",
  "dimension": "duplication",
  "title": "searchTargetSongs and handleManualSearch build /api/osu/search bodies independently, and only one sends artist, title and source",
  "file": "src/app/page.js",
  "line": 450,
  "severity": "medium",
  "evidence": "page.js:450-458 sends query, fallbacks, artist, title and source. page.js:676-681 sends only query. That gap is the root of F-05. The strictness rematch reuses the first builder, so the two diverge silently.",
  "reproduction": "Compare the two request bodies in the Network tab.",
  "confidence": "verified",
  "workstream": "matching-player",
  "fixDirection": "One `buildSearchRequest(song, overrides)` used by every call site, with the manual query passed as an override and re-cleaned (see F-05)."
}
```

### X-09 Song construction and dedupe are scattered

```json
{
  "id": "X-09",
  "sources": ["EXT-07", "EXT-08", "PLY-08", "PLY-11"],
  "area": "client-ui",
  "dimension": "contract",
  "title": "Songs are constructed in three places and deduplicated by two different rules, or not at all",
  "file": "src/app/page.js",
  "line": 226,
  "severity": "medium",
  "evidence": "Construction: extractors.js:240 (id), page.js:370 (id again, playlist path) and page.js:34-46 (beatmapToSong, missing source, F-32). Dedupe: mergeSongs at page.js:226-233 (player sections only), a plain concat at page.js:375 (playlist append, F-27), and set-id dedupe in osu.js:193-235 and 671 onward (F-41). This is why the two entry paths drift from the \"identical song shape\" contract.",
  "reproduction": "See F-27, F-32 and F-45.",
  "confidence": "traced",
  "workstream": "matching-player",
  "fixDirection": "`src/lib/song.js`: `makeSong(fields)`, which fills every contract field including `source`, plus `songKey(song)` and `mergeSongs(a, b)`, used by both entry paths. server-hardening consumes it for F-27 and F-45."
}
```

### X-10 Three row renderers with no parity mechanism

```json
{
  "id": "X-10",
  "sources": ["UI-04", "UI-06"],
  "area": "client-ui",
  "dimension": "duplication",
  "title": "SongRow, SongCardMobile and BeatmapRow each re-implement cover, status, stars, preview and override display",
  "file": "src/components/SongRow.js",
  "line": 1,
  "severity": "low",
  "evidence": "Listed in the 00-map candidate duplication. The rows already disagree: BeatmapRow shows the override mark without its notice (F-49, PlayerSections.js:123-130), and preview logic exists twice (F-36, SongTable.js:29-62 vs PlayerSections.js:313-333).",
  "reproduction": "Code inspection, and the F-49 trace.",
  "confidence": "traced",
  "workstream": "client-ui",
  "fixDirection": "Keep the separate desktop and mobile components (project convention), but share small pieces: `MatchNotice` (mark plus notice as one unit), `StatusBadge` and star colour from beatmapFormat.js, and useAudioPreview. Then parity is structural."
}
```

### X-11 Mirror list and download URLs are hardcoded in four places

```json
{
  "id": "X-11",
  "sources": ["DL-03", "DL-07", "DL-10", "MAT-08"],
  "area": "downloads",
  "dimension": "duplication",
  "title": "Mirror hosts and URL shapes are defined separately in the browser helper, the proxy route, page.js and osu.js",
  "file": "src/lib/beatmapDownload.js",
  "line": 19,
  "severity": "low",
  "evidence": "beatmapDownload.js:19-22 (CORS mirrors) and :31 (proxyUrl), route.js:84-89 (proxy mirrors, repeating two of them), page.js:765 (window.open catboy) and osu.js:905 (downloadUrl). F-15 and F-34 both come from these copies drifting.",
  "reproduction": "Code inspection.",
  "confidence": "verified",
  "workstream": "downloads-cost",
  "fixDirection": "One mirror table (host, URL template, CORS flag, UA profile) imported by the browser helper, the route and the CSP (F-25). Remove the other copies."
}
```

## Doubtful or contract-risky

Nothing here is dropped. Each entry names the finding it qualifies and why.

- **D-01, F-33 (MAT-04): overstated reach and a contract-risky fix.**
  - C2 shows the branch is reachable only when filters or maxArtistRung removed the near-exact title
    candidates, so the severity is lowered from high to medium.
  - The obvious fix (fall through to the wrong-artist branch) is contract-risky. Under `none` trust the
    string was judged not to be an artist, so marking results `artistOverride` would show
    "Could not find one by <X>" for an X that is not an artist.
  - If reordered, salvaged results under none trust need neutral copy and must still not be auto-selected.
    Bench before and after.
- **D-02, F-05 (MAT-01): the audit's fix direction is contract-risky.**
  - Forcing the row's original artist onto a query the user deliberately rewrote would reject what the
    user asked for.
  - Re-derive artist and title from the edited text, and let `source` and resolveArtistTrust decide.
    This keeps the gate without trusting a stale artist.
- **D-03, F-08 (MAT-02): the fix is unverified.**
  - Dropping `s=ranked` may flood the pool with graveyard or pending sets, which could change bench and
    raise calls per track.
  - osu!'s default with no `s` is believed to be "has leaderboard", but that is not verified here.
  - One live capture and a bench run must choose the parameter.
- **D-04, F-40 (MAT-10): the suggested fix would regress cost.**
  - Parallel variants defeat the score-150 early exit and would raise bench:cost above 1.49 calls per track.
  - Keep sequential unless bench:cost proves otherwise.
- **D-05, F-41 (PLY-11): unifying would be a false abstraction.**
  - The two dedupes see different shapes (collection items vs scored candidates).
  - Share a key helper at most.
- **D-06, F-23 (SEC-08): contract-risky upgrade.**
  - A major Next bump touches routing, caching defaults and `force-dynamic` semantics. It could break the
    route-caching convention and several features at once.
  - Do it as an isolated last step with the full inventory walk, or defer it if a patched release of the
    current major clears the advisories.
  - Middleware (X-01) should not ship on an unpatched version.
- **D-07, F-32 (PLY-08): the value of `source` for player songs is a contract choice.**
  - The artist on a player song is the osu! set's own artist, so it can never be DIFFERENT from itself.
    But a rematch from a player row searches for other sets.
  - Pick a value that osu.js treats deliberately. Check `resolveArtistTrust` handles it, and do not reuse
    'spotify' or 'apple'.
  - `beatmapToSong` must stay the single adapter.
- **D-08, F-35 (UI-02): the JS conditional-render fix is contract-risky.**
  - Choosing the tree by `window.innerWidth` causes a hydration mismatch and a flash of the wrong layout
    on phones.
  - Prefer lazy images plus memoized rows, and keep the CSS switch.
- **D-09, F-28 and F-46: recall changes whose effect bench may not see.**
  - If the bench fixtures are captured post-cleaning, `npm run bench` will not reflect cleaner changes.
  - Add the cleaned-query diff to verification (listed under server-hardening).
- **D-10, F-03 (DL-02, DL-12): fix choice affects a feature.**
  - Removing `generateFallbackOsz` outright changes the fallback behaviour that the inventory records.
  - Keeping it is fine only if it can never be counted as a real download: the client rejects
    `fallback-generator` on every path, and the route is capped (F-01). Either option satisfies the
    contract; silently keeping the 200 does not.
- **D-11, X-01: a per-instance memory limiter is weak on serverless.**
  - With no shared store configured, each instance has its own budget. That is still a large improvement
    and it stays zero-key, but it is not a hard cap.
  - The hard caps are the per-request limits: F-01 size cap and maxDuration, and F-14 query cap.
- **D-12, F-48 (UI-07): overstated.**
  - The suggested scoped reset for player-search entry already exists (C1). Downgraded to low; only the
    silent append remains.
- **D-13, 00-map "Feature inventory": one wrong claim.**
  - The map says playlist paste "appends via mergeSongs". It uses a plain concat (C1, page.js:375).
    mergeSongs is used only by loadSection (page.js:266).
  - The feature itself (multi-playlist append) is real and must survive. EXT-07's description is the
    correct one.
- **D-14, special cases flagged per the project rule.**
  - EXT-04's unavailable-video filter compares against literal titles ("Private video", "Deleted video").
    F-18 directs a structural check instead.
  - F-15 and X-07: fixing the catboy 403 by switching UA only for catboy would be a special case. Choose
    the UA per profile, tested against every mirror.
  - F-46: growing BRACKET_NOISE_TERMS is list-based special-casing. Prefer a structural rule.
  - F-06's "refuse when og:title equals the collection name" is accepted only as a general rule (no
    fallback stands in for a collection), not as an Apple-only check.
- **D-15, no-finding entries recorded, not counted.**
  - EXT-14 and EXT-15: the auditor recorded that nothing was found in those checks.
  - UI-08: phone width was traced clean at globals.css:35-36 and 272-283.
  - UI-08 stays a verification item: the client-ui phone-width check must reconfirm it after all four
    workstreams merge.

## Conflicts settled

- **C1: song accumulation (UI-07 vs EXT-07 vs 00-map).**
  - Lines read: page.js:125-129, 149, 191, 226, 266, 303, 326, 335, 340, 375, 874.
  - `handleSubmitInput` passes `forceReplace: Boolean(playerProfile)` (page.js:128).
  - `isAppending = !forceReplace && songs.length > 0` (page.js:335). Otherwise `setSongs([])` (page.js:340).
  - `combinedSongs = isAppending ? [...songs, ...newSongs] : newSongs` (page.js:375).
  - The player search and profile paths clear songs (page.js:149, 191), and so do reload (303),
    clear-player (326) and clear-list (874).
  - mergeSongs (page.js:226) has a single use, in loadSection (page.js:266).
  - Result:
    - The append is an intended multi-playlist queue, done with a plain concat. EXT-07 is correct.
    - 00-map's "appends via mergeSongs" is wrong.
    - UI-07's suggested reset already exists, so it is downgraded to low (F-48).
    - Dedupe on append is F-27.
- **C2: MAT-04 reachability.**
  - Lines read: osu.js:784-850.
  - `filteredSets` keeps finite scores of at least `strict.minScore`.
  - When `formatted` is empty, `titleMatches` come from `[...gatedOut, ...allFoundSets]` with
    titleSimilarity of at least salvageFloor (0.92 at 50).
  - Branch order: `artistConfidence === 'none' && targetArtist` gives artist-unknown (osu.js:823). Then
    `titleMatches.length > 0` gives wrong-artist or artist-absent, returning the top 8 as
    `artistOverride: true, matchScore: null`. Then `absent` gives artist-absent. Otherwise no-match.
  - Under none trust nothing is gated, so a title of 0.92 or more normally already clears minScore 70 and
    is in `formatted`.
  - Result: the branch order is as MAT-04 says, but it only matters when filters or maxArtistRung removed
    those candidates. Lowered to medium (F-33), with the fix caveat in D-01.
- **C3: isDemo overload.**
  - Lines read: page.js:1000, and youtube.js:88 and 267, as cited by EXT-03.
  - page.js:1000 renders a badge from `playlistMeta.isDemo`. /api/playlist sets that flag when YouTube
    extraction fails (getDemoPlaylist), which is a different meaning from the osu! "no credentials" flag
    the search route returns.
  - Result: recorded as X-04. The extraction side is fixed in F-07 (server-hardening), the osu! side in
    F-11 (matching-player).

<!-- CONSOLIDATION COMPLETE -->
