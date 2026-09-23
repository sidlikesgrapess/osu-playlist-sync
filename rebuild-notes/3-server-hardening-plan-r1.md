# Plan: server-hardening (round 1)

## Findings resolved

| id | severity | one-line fix |
|---|---|---|
| F-02 | critical | replace substring URL routing (`extractors.js:177,188,199`) with `src/lib/platform.js` hostname allowlist via `new URL()`; Apple fetch rebuilds its own URL from parsed parts, never fetches the caller's raw string |
| F-06 | high | fix the ld+json regex so `type=` can appear anywhere in the tag and be unquoted (live-verified real markup is `<script id=schema:music-playlist type="application/ld+json">`); refuse (throw), never silently collapse to one og:title song |
| F-07 | high | delete the `getDemoPlaylist()` failure fallback (`youtube.js:52,88`); extraction failure throws a typed error with `.status`, propagated by `api/playlist/route.js`, never sets `isDemo` |
| F-18 | high | follow Innertube continuation tokens (cap 3 pages) instead of stopping at the first `browse` response; detect unavailable items structurally (`isPlayable`/`lengthSeconds` presence), not by title string match; surface `returnedCount`/`totalCount`/`unavailableCount` |
| X-01 | high | in-handler `src/lib/rateLimit.js` (not `src/middleware.js` — see Target design #4 for the cost tradeoff), wired into my two routes now, budgets proposed for the rest |
| F-23 | medium | **deferred** — see below, not a silent skip |
| F-25 | medium | `next.config.mjs` `headers()`: nosniff, referrer-policy, frame-ancestors, CSP shipped `Report-Only` first |
| F-26 | medium | `src/lib/http.js` `fetchWithLimits` (timeout + byte cap + named UA) wired into every fetch in extractors.js and youtube.js |
| F-27 | medium | dedupe appended songs by identity key before concat (`page.js:375`, my owned range) |
| F-28 | medium | `cleanSongTitle` takes a `source` (and provider artist when structured) and skips the dash/colon/`by` splitter when the source already gave a trustworthy artist |
| X-02 | medium | same as F-26 — one helper, both findings close together |
| X-03 | medium | `src/lib/validate.js`, wired into `/api/playlist` (url/query length + hostname allowlist before extraction) |
| X-07 | medium | `UA_PROFILES.mirrorBrowser` in `http.js`, handed to downloads-cost (I don't own the download route) |
| F-45 | low | extractors.js stops inventing `track_${index}_${Date.now()}` ids (`extractors.js:240`); page.js's existing per-batch id assignment (line ~370, my owned range) becomes the single source |
| F-46 | low | replace the flat `BRACKET_NOISE_TERMS` keyword list with a structural rule (drop a bracketed segment when the remainder still has enough letters; keep the bracket-inclusive original as a fallback query for recall) |
| F-47 | low | `PlaylistInput.js:147-158` `detectPlatform` imports `classifyInput` from the same `platform.js` extractors.js uses — one table, not two |
| F-50 | low | `Cache-Control: s-maxage=120, stale-while-revalidate=300` header on `api/github/commits/route.js`, alongside the existing module-level cache |

**Deliberately deferred (not fixed this round):**

- **F-23, the actual Next.js major-version bump.** Verified via `npm view next dist-tags` and the advisory range: the vulnerable range is `9.3.4-canary.0 - 16.3.0-preview.10` — there is no patched 14.x or 15.x release. `next-14` dist-tag is already `14.2.35` (our installed/resolved version) and is still inside the vulnerable range. The only fix is a **major** bump to `16.3.x`, which D-06 flags as contract-risky (routing, caching, and every route's `force-dynamic` convention). That is too large and too cross-cutting to land inside one workstream's round — it needs a full `00-map.md` feature-inventory walk across all three workstreams' routes after they merge. I recommend it as an isolated follow-up project, not a round-1 commit. Severity is lowered further by round-1 itself: choosing an in-handler rate limiter over `src/middleware.js` (X-01) means this round adds **no new Edge Middleware**, so the specific "middleware bypass" CVE class in that range stays inert regardless. Reason recorded here so it isn't silently dropped; tracked as its own follow-up.

## Target design

1. **`src/lib/platform.js`** (new) — one hostname table, used by both extractors.js (server) and `PlaylistInput.js` (client).
   ```js
   export const PLATFORM_HOSTS = {
     spotify: ['open.spotify.com'],
     apple:   ['music.apple.com'],
     youtube: ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'],
   };
   export function classifyInput(raw: string): { kind: 'spotify'|'apple'|'youtube'|'query'|'invalid', url: URL|null }
   export function buildProviderUrl(url: URL): string // protocol + hostname + pathname + search only — no userinfo, no fragment, no caller-controlled extras
   ```
   `classifyInput` parses with `new URL(raw)` inside a try/catch; a throw (no protocol) means plain text → `'query'`. Hostname must exact-match an entry in `PLATFORM_HOSTS[kind]` (the declared-subdomain list is the whole allowlist — no `.endsWith()`, no `.includes()`). Anything URL-shaped but not on the list is `'invalid'`, not silently treated as a search query (that would let a blocked host slip through as free-text and still get an oEmbed-style fetch downstream — it must be rejected, not downgraded).

2. **`src/lib/http.js`** (new) — one outbound fetch helper, one place to cap time/bytes/identity.
   ```js
   export const UA_PROFILES = {
     scraper: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
     mirrorBrowser: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
     osuApi: 'osu-playlist-sync/1.0 (+https://github.com/<owner>/osuplaylist)',
   };
   export class FetchLimitError extends Error { status: number } // .status = 504 timeout, 413 too-large, or the upstream's real status
   export async function fetchWithLimits(url: string, opts?: {
     timeoutMs?: number;   // default 8000
     maxBytes?: number;    // default 5_000_000
     ua?: keyof typeof UA_PROFILES; // default 'scraper'
     method?: string; headers?: Record<string,string>; body?: BodyInit;
   }): Promise<{ status: number; headers: Headers; text(): Promise<string>; json(): Promise<any> }>
   ```
   Implementation: `AbortController` timer restarted is **not** done here (that's the stall-tolerant pattern `beatmapDownload.js` already uses client-side for big archives — this helper is for small JSON/HTML payloads, so a single fixed timeout from request start is correct and simpler). Reads the body via `res.body.getReader()`, throws `FetchLimitError` the instant accumulated bytes exceed `maxBytes`. Throws (never returns) on non-2xx, with `.status` set to the real upstream status — this matches the existing `osuApiGet` convention in `src/lib/osu.js` (`.status`/`.retryAfter` on thrown errors) so matching-player can adopt it without changing its own catch blocks.
   Call sites that move to it (mine): `extractors.js:20,39,78,147` (oEmbed, Spotify embed HTML, Apple page, YouTube oEmbed), `youtube.js:97,193` (Innertube POST, HTML scrape GET), `github/commits/route.js`'s GitHub API call. **Not mine to move, offered to others**: `osu.js`'s `osuApiGet` body fetch and the raw fetch at `osu.js:722` (matching-player); `api/download/route.js:101-128` per-mirror fetch (downloads-cost) — that one specifically should pass `ua: 'mirrorBrowser'`, which is also the X-07 fix (catboy 403s on the current `osu-playlist-sync/1.0 (web-app)` UA).

3. **`src/lib/validate.js`** (new) — typed input guards, thrown errors carry `.status = 400`.
   ```js
   export class ValidationError extends Error { status = 400 }
   export function boundedString(value: unknown, opts: { maxLen: number, name: string }): string
   export function positiveIntId(value: unknown, name: string): number
   export function httpsUrlOrQuery(value: unknown): { isUrl: boolean, raw: string } // length + shape check only; platform.js does hostname classification
   ```
   Wired into `api/playlist/route.js` only, by me. `positiveIntId` is offered to matching-player (`userId`, F-22) and downloads-cost (`beatmapsetId`, F-24) — they call it themselves on their own params, I don't touch their route files.

4. **`src/lib/rateLimit.js`** (new — substituting the architect-suggested `src/middleware.js` vessel; see Risks for why).
   ```js
   export function checkRateLimit(request: Request, routeKey: string): { allowed: boolean, retryAfterSeconds: number }
   export const ROUTE_BUDGETS: Record<string, { limit: number, windowMs: number }>
   ```
   In-memory `Map<string, number[]>` keyed by `${ip}:${routeKey}`, fixed-window counter, module-level singleton (same convention as the existing `osu.js` token cache and `github/commits/route.js` cache — survives across requests in a warm instance, resets on cold start). IP from `x-forwarded-for` (Vercel sets it) with `'unknown'` fallback that **always allows** (per D-11: not a hard cap, never a crash, never blocks a user we can't identify). Never throws.
   **Cost tradeoff (architect note 3), decided**: Next Edge Middleware runs as a *separate* invocation class on Vercel — every matched request pays an edge-function invocation even for routes that end up 429ing instantly, and even for `/api/osu/search` calls the client already fires at concurrency 3 per track. An in-handler check costs one `Map` lookup inside a function invocation we're already paying for. On Hobby, middleware would multiply invocation count by roughly the request count on `/api/*` (every playlist fetches ~10-40 search calls); in-handler adds zero new invocations. **Decision: in-handler, not middleware.** This also sidesteps needing `src/middleware.js` to exist at all this round, which matters for the F-23 defer reasoning above.

5. **Apple ld+json parsing (F-06, inside `extractors.js`'s `fetchAppleMusicEntity`, lines ~78-140)**: replace
   ```js
   /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
   ```
   (anchored — `type=` must be the very first attribute) with
   ```js
   /<script\b[^>]*\btype\s*=\s*("application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi
   ```
   which matches `type=` at any attribute position and both quoted/unquoted forms. **Live-verified 2026-09-23** against `https://music.apple.com/us/playlist/top-100-global/pl.d25f5d1181894928af76c85c967f8f31` (2 requests total, within the 2-request budget): the real tag is `<script id=schema:music-playlist type="application/ld+json">` — `id` unquoted and first, exactly the shape the old regex misses. Keep the existing `while (exec(...))` loop over **all** matches and the existing `@type === 'MusicPlaylist' || 'MusicAlbum' || Array.isArray(data.track)` selection — only the regex itself is wrong.
   **New finding from the same fetch, not in 2-findings.md**: `data.track[0]` for this playlist has keys `['@type','name','url','duration','offers','audio']` — **no `byArtist`** anywhere, and the playlist-level `data.byArtist` is `undefined` (`data.author` is `{name:'Apple Music'}`, the curator, not a per-track artist). This means CLAUDE.md's "Spotify/Apple hand us a real artist field and are trusted on arrival" is **empirically false for Apple playlist tracks** as of this markup. Resolution: `fetchAppleMusicEntity` returns each song with `channelTitle: t.byArtist?.name || schemaData.byArtist?.name || ''` (unchanged expression, now just reachable) — when it comes back empty, `source` stays `'apple'` (provenance is honest — the song *did* come from Apple) but `extractedArtist`/`channelTitle` is honestly empty, same signal a title-only YouTube video already produces. I do **not** invent an artist, and I do **not** relabel `source`. Flagged to matching-player under Cross-workstream interfaces: `resolveArtistTrust`'s "trusted on arrival" shortcut for `source==='apple'` must not assume a non-empty artist string; it should key off whether `extractedArtist` is actually populated, not off `source` alone, for this one provider. Album/song ld+json (not sampled this round — request budget spent) is expected to carry `byArtist` at the top level per the existing fallback expression; that path is unaffected.
   The **collapse-to-one-song bug** (the critical half of F-06) is closed independently of the artist question: today, when the ld+json block isn't found (any reason, not just this regex bug), the code falls through to the single-song OpenGraph fallback and returns one song for a 100-track playlist, silently. Fix: the OpenGraph fallback path is only entered when the URL itself parses (via `platform.js`) as a single-track path (`/song/` or a bare release, not `/playlist/` or `/album/`); for a playlist/album URL, a failed ld+json parse throws (see Findings: never a fake result), it does not fall back to a one-song OG scrape.

6. **YouTube (`youtube.js`)**:
   - `fetchPlaylistItems` (12-89): delete both `getDemoPlaylist()` fallback call sites (52, 88). On total failure (both Innertube and HTML-scrape paths throw or return zero items), throw:
     ```js
     export class ExtractionError extends Error { constructor(message, status) { super(message); this.status = status; } }
     ```
     `status: 404` for "playlist not found / private / empty", `502` for "upstream shape changed / unparseable" — this distinction is what api/playlist/route.js maps to a real HTTP status instead of today's hardcoded 500.
   - `fetchFromInnertube` (94-186): follow `continuationItemRenderer.continuationEndpoint.continuationCommand.token` by re-POSTing the same `youtubei/v1/browse` endpoint with `{ continuation: token }` in place of `browseId`, capped at 3 continuation pages (~400 items total, matches YouTube's ~100-per-page). Replace the literal-string unavailable check (`title !== 'Private video' && title !== 'Deleted video'`, lines 147 and 229 in `fetchFromHtmlScrape` too — this is D-14's "special-cased by name" callout) with a structural one: an item is unavailable when its renderer lacks `lengthSeconds` **and** lacks a playable thumbnail, regardless of what title string YouTube used this week (YouTube's own copy for these states has changed across locales before; the two-string list is exactly "the specific case added to a list" the repo's `no_per_item_special_casing` rule forbids). Return `{ songs, returnedCount, unavailableCount, totalCount }` where `totalCount` comes from the sidebar/header video-count text when present, else `returnedCount + unavailableCount`.
   - This directly explains the architect's todo #6 ("a breakcore playlist has 11 songs but only 7 fetched"): F-18 is the finding, and the mechanism is exactly this — no continuation-token following (stops at page 1) compounded by unavailable items silently vanishing rather than being counted. No 2-findings.md entry names this specific playlist, but F-18's description is this bug; I'm not filing it as a new finding, just confirming the connection explicitly per the architect's ask.

7. **`titleCleaner.js`**:
   - `cleanSongTitle(rawTitle, channelTitle = '', opts = {})` gains `opts.source` and `opts.providerArtist`. When `opts.source` is `'spotify'` or (`'apple'` **and** `opts.providerArtist` is non-empty), skip the dash/colon/`by` splitter (lines 182-213) entirely — `artist = opts.providerArtist`, `title` = the raw title run only through bracket/symbol stripping. This is the F-28 fix: today every source, including a Spotify track whose artist field is already known-correct, gets run through `standardMatch`/`byMatch`, which can wrongly re-split a title that legitimately contains a dash (e.g. a real title "Rise - Reprise"). For YouTube, plain-text query, or Apple-without-an-artist (the gap found above), the existing splitter logic is unchanged — we still don't have a trustworthy structured artist there, so title-side heuristics remain the best available signal.
   - `BRACKET_NOISE_TERMS` (line 7, a flat list of ~20 keywords like `nightcore`, `official video`, `+hdhr`) is replaced by a structural rule in `stripBracketNoise`: a bracketed segment is dropped when, after removing it, the remaining title text still has at least 3 letter characters (i.e., the bracket wasn't load-bearing — it was decoration) — this is a general shape test, not a keyword match, so it doesn't need a new entry every time a new tag string shows up (`+HDHR`, `[TV Size]`, `(1 Hour Loop)`, etc. are all instances of the same shape and none need to be named). The existing pattern-based checks (star rating, resolution, `+mods`) stay as-is since they're already structural. To preserve recall for the rare case where a bracket genuinely was part of the title (a subtitle, a feat. credit), the bracket-inclusive original text is added as one of the `queries[]`/`fallbacks[]` entries rather than discarded — so the primary query gets cleaner (higher precision) without losing the fallback search (recall unchanged).
   - Both changes are benched before/after per D-09 (Verification section has the exact commands and the diff method).

8. **Append dedupe + single id source (F-27, F-45)**: `extractors.js`'s per-song loop (~line 240) changes `id: song.id || \`track_${index}_${Date.now()}\`` to `id: song.id || null` — it stops inventing a non-deterministic id nobody uses (page.js already overwrites it downstream). A small helper in `extractors.js` (my file, exported):
   ```js
   export function songIdentityKey(song) {
     return (song.id && !String(song.id).startsWith('track_'))
       ? `native:${song.id}`
       : `title:${(song.extractedArtist || song.channelTitle || '').trim().toLowerCase()}|${(song.extractedTitle || song.title || '').trim().toLowerCase()}`;
   }
   ```
   used at `page.js:375` (my owned range) to filter `newSongs` against a `Set` built from the existing `songs` array before concatenating, instead of the current plain concat. **This is an interim, local implementation** — matching-player's planned `src/lib/song.js` (X-09) is meant to own canonical song identity across both entry paths (extraction and the osu! player path). Once it lands, `songIdentityKey` here should be deleted and replaced with an import from there; flagged under Cross-workstream interfaces as a fast-follow, not blocking this round since `song.js` doesn't exist yet when this workstream's commits land.

## Changes by file

- **`src/lib/platform.js`** (new) — `PLATFORM_HOSTS`, `classifyInput`, `buildProviderUrl`. ~40 lines.
- **`src/lib/http.js`** (new) — `UA_PROFILES`, `FetchLimitError`, `fetchWithLimits`. ~70 lines.
- **`src/lib/validate.js`** (new) — `ValidationError`, `boundedString`, `positiveIntId`, `httpsUrlOrQuery`. ~35 lines.
- **`src/lib/rateLimit.js`** (new, in place of the suggested `src/middleware.js` — see Target design #4) — `checkRateLimit`, `ROUTE_BUDGETS`. ~45 lines.
- **`src/lib/extractors.js`**:
  - 177/188/199: substring dispatch → `classifyInput(input)` switch.
  - 20,39,78,147: raw `fetch` → `fetchWithLimits`.
  - 78: Apple fetch target becomes `buildProviderUrl(parsedUrl)`, never the caller's raw string.
  - 87-140: ld+json regex fix; playlist/album URLs throw instead of OG-fallback-collapsing to one song.
  - ~240: drop invented `id`; add exported `songIdentityKey`.
  - per-song `cleanSongTitle` call: pass `{ source: song.source, providerArtist: song.channelTitle }`.
- **`src/lib/youtube.js`**:
  - 52,88: delete `getDemoPlaylist()` fallbacks, throw `ExtractionError` instead.
  - 94-186, 191-262: add continuation-following; replace literal-string unavailable check (147, 229) with structural check; return counts.
  - 267-318 `getDemoPlaylist()`: deleted entirely (dead code once 52/88 no longer call it — confirmed nothing else references it via grep before removal).
- **`src/lib/titleCleaner.js`**:
  - 7: `BRACKET_NOISE_TERMS` list removed.
  - 76-106 `stripBracketNoise`: structural remainder-length rule; bracket-inclusive original pushed into fallback queries.
  - 113: `cleanSongTitle` signature gains `opts = {}`; 182-213 splitter gated on `!opts.providerArtist`.
- **`src/app/api/playlist/route.js`** (27 lines total):
  - Line 18 area: validate `queryOrUrl` via `validate.js` (length bound) before calling `extractMusicData`; if it parses as a URL via `classifyInput`, reject `'invalid'` kind with 400 before extraction runs.
  - Top of `GET`: `checkRateLimit(request, 'playlist')`, 429 with `Retry-After` header when refused.
  - Line 20 `catch (error)`: map `error.status` (from `ExtractionError`/`FetchLimitError`/`ValidationError`) to the response status instead of the current hardcoded value; never attach `isDemo`.
- **`src/app/api/github/commits/route.js`** (87 lines total):
  - Line 43 `GET()`: `checkRateLimit(request, 'githubCommits')` at top.
  - `User-Agent` header (line 54) moves to `UA_PROFILES.scraper` via `fetchWithLimits` in place of the raw `fetch`.
  - Response: add `Cache-Control: s-maxage=120, stale-while-revalidate=300` alongside the existing in-memory `CACHE_TTL_MS` (line 10) — the header lets Vercel's edge cache absorb repeat hits across cold starts, the in-memory cache still covers warm-instance hits; neither replaces the other.
- **`next.config.mjs`** (26 lines total): add an `async headers()` export (see Findings F-25) alongside the existing `reactStrictMode`/`images.remotePatterns` (lines 3, 5).
- **`package.json`** (line 20, `"next": "^14.2.24"`): unchanged this round (F-23 deferred); a comment is **not** added to the file since no source file besides the plan is touched in round 1 planning, and the implementing session should treat this as a no-op line item for this round.
- **`src/app/page.js`** (owned ranges only):
  - **334-407 (`handleFetchPlaylist`)**: wire `songIdentityKey`-based dedupe into the append branch (~line 375); extend the `setPlaylistMeta` call (~357-363) with `returnedCount`, `totalCount`, `unavailableCount` from the route response; the existing `catch` block (~400-404) needs no change — it already does `setErrorMessage(err.message)`, which is exactly the right behavior once extraction throws real errors instead of returning `isDemo`.
  - **995-1010 (`playlistMeta.isDemo` badge)**: this block becomes dead once extraction never sets `isDemo` (osu!'s own `isDemo`, a different flag entirely per X-04/C3, is not this workstream's concern and isn't rendered here). Repurposed **in place** (same lines, same owned range) to render "Showing X of Y" when `playlistMeta.returnedCount < playlistMeta.totalCount`, using the counts added above.
- **`src/components/PlaylistInput.js:147-158` (`detectPlatform` only)**: body replaced with a call to `classifyInput` from `src/lib/platform.js`, mapping its `kind` to whatever local UI state `detectPlatform` currently drives (icon/label per platform) — no behavior change for valid URLs, only removes the second, duplicate substring table.

## Cross-workstream interfaces

**Provided by this workstream:**
- `src/lib/platform.js` — `classifyInput(raw)`, `buildProviderUrl(url)`, `PLATFORM_HOSTS`. No other workstream currently needs hostname classification, but it's the one place to add a platform later.
- `src/lib/http.js` — `fetchWithLimits(url, opts)`, `UA_PROFILES`. Throws with `.status` set, matching `osuApiGet`'s existing convention (`src/lib/osu.js`), so matching-player can drop it into `osuApiGet`'s body fetch and the raw fetch at `osu.js:722` without changing catch-block shape. downloads-cost should call it from `api/download/route.js:101-128`'s per-mirror loop with `ua: 'mirrorBrowser'` — this is the X-07 fix (catboy 403s the current UA string) and should not be re-solved independently there.
- `src/lib/validate.js` — `positiveIntId(value, name)` for matching-player's `userId` (F-22) and downloads-cost's `beatmapsetId` (F-24); `boundedString` for any other free-text query param.
- `src/lib/rateLimit.js` — `checkRateLimit(request, routeKey)` + `ROUTE_BUDGETS`. I wire it into my two routes as the reference implementation; matching-player wires it into `/api/osu/search`, `/api/osu/player`, `/api/osu/player/beatmaps`; downloads-cost wires it into `/api/download`. Suggested budgets (tune during implementation, not contractual): `playlist: 10/60s`, `osuSearch: 60/60s` (concurrency-3 fan-out needs headroom), `osuPlayer*: 20/60s`, `download: 30/60s`, `githubCommits: 20/60s`.

**Needed from other workstreams:**
- matching-player's `src/lib/song.js` (X-09) — once it exists, `extractors.js`'s local `songIdentityKey` should be deleted in favor of importing the canonical identity function from there, so both entry paths (extraction append, and the osu! player path this workstream doesn't touch) dedupe the same way. Not a round-1 blocker; flagged as a fast-follow commit.
- matching-player should double-check `resolveArtistTrust`'s handling of `source === 'apple'` with an **empty** `extractedArtist` (the newly-verified Apple-playlist gap above) — this workstream only guarantees the field is honest, not that it's populated.
- A synchronization point, not code: the F-23 Next major bump should happen only after all three workstreams' routes are merged and re-inventoried against `00-map.md`'s feature list, since `force-dynamic` semantics and routing are shared load-bearing conventions across every route in the app.

## Implementation order

1. `src/lib/platform.js` + wire into `extractors.js` dispatch (177-199) + `PlaylistInput.js:147-158`. Verify: SSRF probe now 400s, all three real platform links still route correctly (F-02, F-47).
2. `src/lib/validate.js` + wire into `api/playlist/route.js` (length bound + hostname-allowlist reject before extraction). Verify: oversized/invalid inputs 400 (X-03, part of F-02 defense-in-depth).
3. `src/lib/http.js` + move extractors.js/youtube.js fetch call sites onto it. Verify: a deliberately slow/huge test URL times out instead of hanging the route (F-26, X-02).
4. Apple ld+json fix + playlist/album collapse guard. Verify: the live-captured playlist shape now yields ~100 songs, not 1 (F-06).
5. YouTube: delete demo fallback, throw typed errors, add continuations + structural unavailable detection, thread counts through `api/playlist` into `handleFetchPlaylist`/the repurposed badge block. Verify: bad playlist id → 404 JSON, not 200 demo data; a long real playlist returns more than one page's worth (F-07, F-18).
6. `titleCleaner.js` source-aware splitter. Bench before/after (F-28).
7. `titleCleaner.js` structural bracket rule. Bench before/after + cleaned-query diff (F-46).
8. Append dedupe + single id source in extractors.js + page.js:375 (F-27, F-45).
9. `src/lib/rateLimit.js` + wire into my two routes; `Cache-Control` header on commits route (X-01, F-50).
10. `next.config.mjs` security headers, CSP as `Content-Security-Policy-Report-Only` (F-25).
11. (Explicitly out of round 1, tracked separately) F-23 Next major-bump investigation spike.

Each step above is a separate commit and independently verifiable via the matching bullet in Verification.

## Risks

- **Platform allowlist too narrow breaks a real link shape.** Contract endangered: "every feature on main survives" (zero-key extraction for all three providers). Mitigation: enumerate every hostname variant actually handled today (`youtu.be`, `m.youtube.com`, `music.youtube.com` already appear in current code) before cutting over; test each manually against `PLATFORM_HOSTS` in step 1's verification, not just the happy path.
- **Apple artist-gap fix changes matching behavior for Apple playlists.** Contract endangered: "artist is a gate never a weight" / "source populated on every path." Mitigation: this workstream never fabricates an artist or mislabels `source` — the empty-string signal is the same shape a title-only YouTube video already produces, which the existing gate logic already has to handle; explicitly flagged to matching-player rather than silently assumed safe.
- **Demo-playlist removal changes a visible behavior.** Contract endangered: "no feature regresses." Mitigation: checked `00-map.md`'s feature inventory — the demo playlist is not listed as an intentional feature, only as a bug workaround (X-04/C3 already call the `isDemo` overload a defect); removal converts a silent wrong-data path into a visible, correct error, which is a fix, not a removal of user-facing capability.
- **YouTube continuations increase per-request wall-clock time.** Contract endangered: none directly, but Vercel Hobby bills function *duration*, and a 3-page Innertube walk is slower than today's single page. Mitigation: cap at 3 continuations (~400 items, generous for any real playlist), and every continuation POST goes through `fetchWithLimits`'s timeout so a slow/hung page can't make the whole request run away.
- **In-memory rate limiter is not a real cross-instance cap** (D-11). Mitigation: documented as best-effort abuse deterrent, not a hard ceiling; the hard ceilings are the per-request byte/time caps in `http.js` and the input bounds in `validate.js`, which apply regardless of instance count.
- **CSP breaks something not caught by grep.** Contract endangered: desktop/mobile UI must keep working. Mitigation: ship `Content-Security-Policy-Report-Only` first (step 10), manually browse the app checking DevTools console for violation reports, only flip to enforcing in a follow-up commit once clean.
- **titleCleaner changes regress matching quality.** Contract endangered: "npm run bench no regression" (explicit repo rule). Mitigation: steps 6 and 7 are each benched independently before merging; any drop below baseline (hit 31, correctAbstain 6, WRONG ARTIST 0, miss 0, unreachable 0, correct offered 752, hard-rejected correct 22; bench:cost 55 calls/1.49 per track) blocks that commit, not the rest of the plan.
- **F-23 stays deferred.** Contract endangered: none new — the advisory was already present on main; this round doesn't add exposure (no new middleware, no new use of the affected surface) and doesn't remove any existing exposure either. Documented so it isn't mistaken for "handled."

## Verification

Commands run from the repo root; dev server on `:3000` is already running (never started/stopped/built by this plan).

1. **SSRF closed (F-02)**:
   ```
   curl -s -X POST localhost:3000/api/playlist -H "Content-Type: application/json" -d "{\"query\":\"http://169.254.169.254/latest/meta-data/\"}"
   ```
   Expected: 400 with a `classifyInput`-driven message, not a fetch attempt (check no outbound connection in server logs).
2. **Real links still work (F-02/F-47)**: paste a known Spotify playlist, an Apple playlist, and a YouTube playlist URL into the UI at `:3000` — each should still classify and extract, confirming no regression from the allowlist rewrite.
3. **Apple playlist no longer collapses (F-06)**:
   ```
   curl -s localhost:3000/api/playlist?url=https://music.apple.com/us/playlist/top-100-global/pl.d25f5d1181894928af76c85c967f8f31 | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).songs.length))"
   ```
   Expected: close to 100, not 1. (This is the same live playlist already fetched twice this session — a third live Apple request would exceed this workstream's stated 2-request budget, so this check should be run by the implementing session, not repeated here.)
4. **YouTube failure surfaces as a real error (F-07)**:
   ```
   curl -s -o /dev/null -w "%{http_code}\n" "localhost:3000/api/playlist?url=https://www.youtube.com/playlist?list=PLdoesnotexist000000000000000"
   ```
   Expected: 404 or 502, not 200 with `isDemo:true`.
5. **YouTube undercount fixed (F-18)**: load a playlist with 11 known tracks (the architect's breakcore example) and confirm the UI's "Showing X of Y" notice (repurposed badge block, page.js:995-1010) either shows 11/11 or explains the gap, instead of silently stopping at 7.
6. **Bench gate (F-28, F-46)**:
   ```
   npm run bench
   npm run bench:cost
   ```
   Expected: hit ≥ 31, correctAbstain ≥ 6, WRONG ARTIST = 0, miss = 0, unreachable = 0, correct maps offered ≥ 752, hard-rejected correct ≥ 22 (baseline, no regression); bench:cost ≤ 55 calls / ≤ 1.49 per track. Additionally diff a sample of cleaned queries before/after (D-09): dump `cleanSongTitle` output for the fixture titles before and after each titleCleaner commit and confirm no unexpected drops in recognizable artist/title pairs.
7. **Security headers (F-25)**:
   ```
   curl -sI localhost:3000/ | grep -i "x-content-type-options\|referrer-policy\|content-security-policy\|x-frame-options"
   ```
   Expected: all four present; CSP header name is `Content-Security-Policy-Report-Only` until the follow-up flip commit.
8. **Rate limit (X-01)**:
   ```
   for i in 1 2 3 4 5 6 7 8 9 10 11; do curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/github/commits; done
   ```
   Expected: 200s then a 429 with `Retry-After` once the route's budget is exceeded.
9. **GitHub cache header (F-50)**:
   ```
   curl -sI localhost:3000/api/github/commits | grep -i cache-control
   ```
   Expected: `Cache-Control: s-maxage=120, stale-while-revalidate=300`.
10. **Phone width (contract, not a new finding)**: browser check at 375px width on the playlist input and the repurposed badge/notice block — no horizontal scroll.

## Cost impact

- **osu! API calls**: unchanged. No file this workstream touches calls the osu! API; matching-player's `osu.js` is untouched here (only offered `http.js` for optional adoption).
- **Vercel function invocations**: no new invocation type added. Choosing an in-handler rate limiter over `src/middleware.js` avoids adding a per-request Edge Middleware invocation on every `/api/*` call — on Hobby's monthly invocation cap, this matters more than the rate limiter's own logic, since a single playlist fetch already fans out to ~10-40 `/api/osu/search` calls at concurrency 3; middleware would have doubled the invocation count for the whole session, in-handler adds zero.
- **Origin transfer**: YouTube continuation-following (up to 3 Innertube pages instead of 1) increases *inbound* bytes the function reads from YouTube, but the function's own *response* to our client is still just the trimmed `songs` array — no proportional increase in what we serve. `fetchWithLimits`'s byte cap bounds the worst case regardless. Download-route bytes are untouched (not owned by this workstream; `beatmapDownload.js`'s CORS-mirror-first design already keeps normal-path bytes off Vercel, per the existing contract).
- **Bundle size**: `platform.js`'s `classifyInput` is imported client-side by `PlaylistInput.js` (previously that file had its own inline table, so this is close to a wash, maybe +0.5KB net for the shared allowlist constant); `http.js`, `validate.js`, `rateLimit.js` are server-only (route handlers and `lib/` files that never render), so they add to the server function bundle only, not the client JS shipped to the browser — a few KB at most, well under any meaningful threshold.
- **Advisory exposure**: unchanged from main (F-23 deferred, no new middleware added, so no new surface for the deferred CVE range either).
