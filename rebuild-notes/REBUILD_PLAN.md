# osu!Sync rebuild plan

Phase 4 output of Session 1. Session 2 implements this plan. It supersedes the four `3-*-plan-r1.md` files where they disagree.

## Status

- **Inputs.** Phase 0 map, phase 1 audits, phase 2 findings (F-01..F-50, X-01..X-11, D-01..D-15), phase 3 round 1 plans and critiques.
- **Phase 3.** All four critiques returned "revise". Round 2 was abandoned after its agents stalled three times.
  - As agreed, the architect settled every round 1 blocking item in this file. Each one is marked **[settled by architect]**.
  - A critique item that is not mentioned here is accepted as the critic wrote it.
- **Line numbers.** All are as of `bdc6990`; `git diff --stat bdc6990 -- src` was empty at the time of writing. Whoever merges second rebases by function name, not by line.
- **Bench baseline** (re-run by the matching-player critic):
  - hit 31, correctAbstain 6, WRONG ARTIST 0, miss 0, unreachable 0
  - offered 752, hard-rejected correct 22
  - cost: 55 calls, 1.49 per track
  - "Hard-rejected correct" counts failures, so its bound is **≤ 22**. Every other count is "no worse than".

### Code facts re-checked by the architect in phase 4

| claim | evidence | result |
|---|---|---|
| Demo response `{type:'profile', user:null}` crashes the client | `page.js:170-173` calls `applyPlayerProfile(data.user)`; `:196` reads `profile.counts?.best`, which throws on `null` | confirmed |
| `mergeSongs` keeps existing rows and assigns `position` | `page.js:225-232` | confirmed |
| `beatmapToSong` sets `playerMeta` and `playerSection`, but no `source` and no `extractedArtist` | `page.js:34-46` | confirmed |
| The append toast already exists | `page.js:383-390` | confirmed |
| Filtering runs before dedupe on purpose | `osu.js:283-286` | confirmed |
| `queriesToRun` puts `targetTitle` last | `osu.js:695-702` | confirmed |
| A 429 is only warned about | `osu.js:719-731` | confirmed |
| The client never checks `res.ok` on the per-song search | `page.js:468-487`; the HTTP status is ignored and a missing `beatmapsets` becomes "no match" | confirmed |
| All three auto-select guards key on `artistOverride` only | `page.js:477`, `:607`, `:689` | confirmed |
| Salvage flags results `artistOverride` | `osu.js:837-843` | confirmed |
| Salvage runs after `artist-unknown` | `osu.js:823-825` | confirmed |
| Structured trust already needs a non-empty artist | `osu.js:685`, `:691` | confirmed |
| Two status sets | `osu.js:237` has 4 (with approved); `beatmapFormat.js:35` has 3 | confirmed; the matching-player plan's text had them the wrong way round |
| The explicit demo branch serves the preset | `youtube.js:51-53`; the silent fallback is `youtube.js:88` | confirmed |
| The lazy `window` guard pattern exists | `soundEffects.js:15` | confirmed |
| The setup guide opens only from the Navbar | `page.js:891` sets `setIsSetupOpen(true)` | confirmed |

Verified live in earlier phases:

- **D-03.** `s=ranked` returns only ranked and approved. `s=leaderboard` adds loved. Qualified is included according to osu-web's source (traced, not observed).
- **Apple.**
  - Playlist tracks in `<script id=schema:music-playlist type="application/ld+json">` have no `byArtist`.
  - A single song (`/us/album/idol/1688334284?i=1688334537`) has only a `schema:song` block of @type MusicComposition, with no `byArtist`. Its og:title is "Idol by YOASOBI on Apple Music".
- **Next.js.**
  - npm audit rates next critical; every advisory is patched at 15.5.24 or later, and 15.5.26 exists.
  - postcss is high, transitive, at ≤ 8.5.22.
  - `/_next/image` is an open optimizer returning 200, and nothing in `src` uses `next/image`.
- **Bench cannot see some changes.**
  - `bench/pool.mjs replay()` (46-127) replays captured buckets through its own loop, with its own `best >= 150` exit at `:101`. It never calls `searchOsuBeatmaps` or `cleanSongTitle`.
  - So query building, the early exit, salvage and the cleaner are all invisible to `npm run bench`. See the Verification section.

## 1. Target architecture

### 1.1 Module layout

New modules are marked *new*. The owner is the workstream that writes the module; everyone else only imports it.

```
src/lib/
  http.js          new  foundation   UA_PROFILES, fetchText/fetchJson (timeout, byte cap, .status), fetchUpstream (raw Response)
  validate.js      new  foundation   ValidationError(400), boundedString, positiveIntId, boundedStringArray
  rateLimit.js     new  foundation   checkRateLimit, rateLimitResponse
  platform.js      new  foundation   PLATFORM_HOSTS, classifyInput, buildProviderUrl
  song.js          new  foundation   songKey, makeSong, mergeSongs
  mirrors.js       new  foundation   BROWSER_MIRRORS, PROXY_MIRRORS, MIRROR_HOSTS, beatmapsetPage
  beatmapFormat.js      foundation   + LEADERBOARD_STATUSES, isRankedStatus, upstreamStatusFor,
                                       isAutoSelectable, overrideNoticeFor
  osuRoute.js      new  matching-player  toRouteError (returns NextResponse), demoResponse
  collection.js    new  matching-player  matchesCollectionFilters, dedupeByBeatmapset, visibleItemsFor (client-safe)
  archive.js       new  downloads-cost   isValidArchiveBlob (head magic + EOCD), MIN_ARCHIVE_BYTES
  filename.js      new  downloads-cost   sanitizeStem, osuFilename, contentDisposition
  useAudioPreview.js new client-ui    one lazy Audio owner, mount registry
src/components/
  MatchNotice.js   new  client-ui     OverrideMark + OverrideNotice, both driven by overrideNoticeFor
  BeatmapCover.js  new  client-ui     cover, lazy image, play button (props-driven)
test/              new  foundation   node --test suites (*.test.mjs); package.json gets "test": "node --test test/"
```

**The foundation commit is new.** In round 1, `http.js` and `validate.js` belonged to server-hardening, and `song.js` belonged to matching-player. In practice every workstream imports these modules, and the r1 plans each invented their own copies:

- matching-player planned `errors.js` and a private `withUserAgent`
- downloads-cost planned its own UA
- client-ui and matching-player had conflicting `MatchNotice` designs

**[settled by architect]** The shared interfaces land in one commit before anything else:

- Server-hardening writes it, since it owns `package.json` and `next.config.mjs`.
- It contains only the modules marked "foundation", with their tests.
- It makes no behaviour change in any route.

No `src/middleware.js`: the rate limit is called inside each handler (A1).

### 1.2 Shared interfaces

Signatures are binding. The bodies are illustrative.

**`http.js`** (A2)
```js
export const UA_PROFILES = {
  server: 'osuSync/1.0 (+https://github.com/sidlikesgrapess/osu-playlist-sync)',
  browserLike: /* a current desktop browser UA, for scraped providers that reject bots */,
};
export async function fetchText(url, { profile = 'server', timeoutMs = 8000, maxBytes = 2_000_000, headers, signal } = {})
export async function fetchJson(url, opts)          // fetchText + JSON.parse
export async function fetchUpstream(url, { profile, timeoutMs, signal, headers })   // raw Response, no buffering
```

- A non-2xx response throws `Error` with `.status`. A timeout throws with `.status = 504`. An over-cap body throws with `.status = 502`.
- The byte cap counts bytes as they stream in, rather than trusting Content-Length.
- `fetchUpstream` exists so the download relay can build its own byte-capped streaming. `http.js` does not stream on its behalf.
- The profile for each host is chosen once, in data: the mirror table's `uaProfile` field, and the extractors' constants.
- **No per-host special case.** Every mirror is tested with a HEAD request under the server profile before its profile is fixed (per D-14 and F-15).

**`validate.js`** (A3)
```js
export class ValidationError extends Error { status = 400 }
export function boundedString(v, { name, max = 500, required = true })
export function positiveIntId(v, { name })          // /^[1-9]\d{0,9}$/ (verified correct by the downloads critic)
export function boundedStringArray(v, { name, maxItems = 8, maxLen = 200 })   // truncates, never 400s
```

- Every route validates **before** any upstream fetch (N8).

**`rateLimit.js`** (A1)
```js
export function checkRateLimit(request, { bucket, limit, windowMs }) -> { ok, retryAfterSec }
export function rateLimitResponse(retryAfterSec)    // 429, Retry-After, JSON { error }
```

- The client IP is the first x-forwarded-for hop, then x-real-ip.
- An unknown IP shares one `'unknown'` bucket and never fails open.
- The store is per-instance memory (D-11, recorded as a known weakness).
- Budgets per 60 s: playlist 10, osuSearch 60, osuPlayer and osuPlayerBeatmaps 20 each, download 30, githubCommits 20.
- **[settled by architect]** Every `/api/*` route is wired (server-hardening B6). Each workstream wires its own routes.

**`platform.js`** (server-hardening B4, B5, **[settled by architect]**)
```js
export const PLATFORM_HOSTS = { spotify: ['open.spotify.com'], apple: ['music.apple.com'],
  youtube: ['www.youtube.com','youtube.com','m.youtube.com','music.youtube.com','youtu.be'],
  player: ['osu.ppy.sh'] };
export function classifyInput(raw) -> { kind: 'spotify'|'apple'|'youtube'|'player'|'query'|'invalid', url?, query? }
export function buildProviderUrl(kind, id)
```

The input is URL-shaped only when either:

- it matches `^[a-z][a-z0-9+.-]*://`, or
- it starts with a known host followed by `/`; `https://` is then prepended.

Classification of a URL-shaped input:

- An `https` URL whose normalized host is on the list is a link. Normalizing lowercases the host and strips a trailing dot.
- `player` additionally needs a path starting `/users/` or `/u/`.
- Any other URL-shaped input is `invalid`, which becomes a 400.
- Everything else is a `query`.

`"YOASOBI: Idol"` and `"Re:Zero"` must stay queries.

The same module replaces:

- the substring checks at `extractors.js:177`, `:188`, `:199`, which are the F-02 SSRF
- the client `detectPlatform` at `PlaylistInput.js:147-158`

The `selectedPlatform` override is kept.

**`song.js`** (X-09, matching-player B8 and B9, **[settled by architect]**)
```js
export const songKey = (song) => /* stable provider identity: provider track/video id, else normalized title|artist */
export function makeSong(fields)    // fills the song contract's defaults; passes through every unknown field untouched
export function mergeSongs(prev, incoming) -> { songs, added, skipped }
```

- **`makeSong`.**
  - Required: `source` must be one of `'spotify' | 'apple' | 'youtube' | 'query' | 'osu-player'`.
  - Everything else defaults, and extra fields pass through: `playerMeta`, `playerSection`, `position`, `rejection`.
  - A spread of the input goes last, so no field the caller sets is dropped.
- **`mergeSongs`.**
  - Existing rows win on a collision, so a row the user already searched or selected is never overwritten.
  - `position` is assigned to additions only.
  - It dedupes by `songKey`, replacing the separate id check in `page.js:225-232`.
  - Both the playlist append (F-27, currently a plain concat at `page.js:375`) and `loadSection` use it.
- It supersedes server-hardening's `songIdentityKey` and fixes F-45: the song id is generated in one place.
- The `skipped` count feeds the append toast (server-hardening N1). An all-duplicate append is no longer silent.
- React keys come from `song.id`. Ids are unique after `mergeSongs`, so two copies of a videoId can no longer collide.

**`mirrors.js`** (X-11)
```js
export const BROWSER_MIRRORS = [{ name, url: id => ..., uaProfile: null }]   // catboy, nerinyan (CORS)
export const PROXY_MIRRORS   = [{ name, url: id => ..., uaProfile: 'server' }] // beatconnect, sayobot (until U-1 settles)
export const MIRROR_HOSTS    = [...every host, including redirect targets such as tc1.sayobot.cn:25225]
export const beatmapsetPage  = id => `https://osu.ppy.sh/beatmapsets/${id}`
```

Consumers:

- the browser helper, the proxy route, the F-34 last resort in `page.js`
- the CSP in `next.config.mjs`

`osu.js:905` `downloadUrl` is deleted (F-37).

**`beatmapFormat.js` additions** (X-06, A8, **[settled by architect]**)
```js
export const LEADERBOARD_STATUSES = ['ranked', 'approved', 'qualified', 'loved'];
export function isRankedStatus(status)          // one set, used by osu.js search, collection filters, page.js narrowing
export function upstreamStatusFor(filter)        // 'ranked' -> 'leaderboard', anything else -> 'any'
export function isAutoSelectable(beatmapset)     // !!beatmapset && !beatmapset.artistOverride && !beatmapset.titleOnly
export function overrideNoticeFor(beatmapset, song)
  // -> null
  //  | { kind: 'artist', artist }   artistOverride, with a non-empty artist
  //  | { kind: 'closest' }          artistOverride, artist empty
  //  | { kind: 'title' }            titleOnly (salvage under none trust: the string is not an artist)
```

- `osu.js:237` `RANKED_STATUSES` and `beatmapFormat.js:35` `RANKED_AND_LOVED` are both deleted.
- The UI label "Ranked & Loved" now means exactly `LEADERBOARD_STATUSES`, on every path (F-08, F-30).
- The three auto-select sites (`page.js:477`, `:607`, `:689`) call `isAutoSelectable` and nothing else.
- Download and export never need to check a flag. A flagged result is simply never in the selection unless the user ticks it.

**`osuRoute.js`** (A3, matching-player B7, X-04, X-05, **[settled by architect]**)
```js
export function toRouteError(error, { notFoundMessage }) -> NextResponse
  // 400 ValidationError, 404 notFoundMessage, 429 "osu! is rate limiting us, try again in a minute", else 502.
  // Never echoes the upstream path (F-31).
export function demoResponse(extra = {}) -> NextResponse   // 200 { isDemo: true, ...extra }
```

- This is the only error-to-Response mapper for osu! routes. There is no separate `errors.js`.
- `/api/playlist` and `/api/download` handle their own errors, which are ValidationError or ExtractionError.

**Response shapes.**

| route | success | demo | failure |
|---|---|---|---|
| `/api/osu/search` | `{ success:true, beatmapsets, total, bestScore, artistConfidence, rejection }` | `{ isDemo:true, beatmapsets:[] }` | `toRouteError`; an upstream 429 becomes **429**, never an empty success (F-09) |
| `/api/osu/player` | `{ type:'profile', user }` or `{ type:'list', users, total }` | `{ isDemo:true, type:'demo' }` | `toRouteError` |
| `/api/osu/player/beatmaps` | `{ items, fetched, total }` | `{ isDemo:true, items:[] }` | `toRouteError` |
| `/api/playlist` | `{ songs, playlistTitle, returnedCount, totalCount, unavailableCount }` | not applicable | 400 invalid input, 502 `{ extractionFailed:true, error }` |

- `extractionFailed` is a separate field from `isDemo`, so each flag means one thing (X-04).
- The YouTube preset `PLosu_banger_showcase_01` still returns the demo playlist through its explicit branch (`youtube.js:51-53`), marked `isDemo: true` (server-hardening B1).

**Song contract additions** (these go into the CLAUDE.md contract block in Session 2):

- `source` gains `'osu-player'`.
  - `resolveArtistTrust` treats it as structured, because the artist string is the mapped set's own metadata.
  - Structured trust still requires a non-empty artist (`osu.js:691`).
- `beatmapToSong` is routed through `makeSong`. It sets:
  - `source: 'osu-player'`
  - `extractedArtist` = the set's artist, and `extractedTitle` = the set's title
  - `playerMeta`, `playerSection`

  Setting the artist fixes F-32. It also fixes the empty-artist mark reported by the client-ui critic (B4).
- The beatmapset gains `titleOnly: true`, alongside `artistOverride`.

## 2. Accepted fixes by workstream

Each entry gives the finding, the fix, and where the round 1 plan was amended. A finding not listed under a workstream is accepted as its r1 plan and the critique wrote it.

### 2.0 Foundation (server-hardening writes it; one commit)

1. Write all the modules in section 1.2 marked "foundation". Tests:
   - `test/platform.test.mjs`, covering B4's cases:
     - `"YOASOBI: Idol"`, `"Re:Zero"`
     - `https://example.com/?x=music.apple.com`
     - `music.apple.com.evil.com`, a trailing-dot host
     - `osu.ppy.sh/users/2`
   - `test/song.test.mjs`: existing rows win, `position`, and passthrough of `playerMeta`.
   - `test/rateLimit.test.mjs`: limit plus one, and the unknown bucket.
   - `test/http.test.mjs`: a stub server for the timeout, the byte cap and `.status`.
   - `test/beatmapFormat.test.mjs`: every `overrideNoticeFor` branch and `isAutoSelectable`.
2. Add a `test` script to `package.json`. `node --test` passes vacuously with no files, so the suites must exist in this same commit (downloads-cost critique).
3. Gate: `npm test` passes, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` returns 200, and `npm run bench` matches the baseline.

### 2.1 server-hardening

Findings: F-02, F-06, F-07, F-18, X-01, F-25, F-26, F-27, F-28, X-02, X-03, X-07, F-45, F-46, F-47, F-50, and F-23 (moved to step 2.5).

1. **F-02 (critical).** `extractors.js` uses `classifyInput` and `buildProviderUrl`. No provider URL is built from caller text other than a provider id.
   - The oEmbed fetch at `extractors.js:148` goes through `fetchText`.
   - Every extractor fetch goes through `http.js` (F-26, X-02, X-07).
2. **X-01.** Wire `checkRateLimit` into `/api/playlist` and `/api/github/commits`.
3. **F-06, Apple (B12, [settled by architect]).**
   - An input is a single song when the path contains `/song/` or `searchParams.has('i')`. Anything else is a collection.
   - Singles:
     - Accept `@type` MusicRecording or MusicComposition from ld+json.
     - The title is the ld+json `name`.
     - The artist is taken from og:title only when og:title reads exactly `<name> by <artist> on Apple Music`, with `<name>` equal to the ld+json name. The match is anchored on the known title and is not a guess.
     - Otherwise the artist is empty, which gives trust `none`.
   - Collections:
     - Parse the track list out of `schema:music-playlist`.
     - An empty track list throws ExtractionError.
     - Never fall back to a single song that stands in for a collection. This is the general rule from D-14, not an Apple-only check.
   - The id regex capture moves to group 2 (`extractors.js:91`).
   - Apple playlist tracks have no artist (see U-6). They are matched on title alone at trust `none`. That is strictly better than today's one fake song.
4. **F-07 (B1, [settled by architect]).**
   - Delete the silent demo fallbacks at `youtube.js:52` (the "try" path's fall-through) and `youtube.js:88`. Failure throws `ExtractionError`, and the route returns 502 with `extractionFailed:true`.
   - Keep the explicit preset branch at `youtube.js:51-53` for `PlaylistInput.js:35`.
5. **F-18 (B8, B9, B10, [settled by architect]).**
   - **Continuations are dropped as work.** `maxVideos=100` (`youtube.js:182`) caps the playlist, and the 11→7 breakcore case fits on one page. The loss comes from the item filters at `youtube.js:147`, `:171`, `:229`, `:247`.
   - **Unavailable items are detected structurally**, never by title (D-14):
     - Per renderer shape, an item is unavailable when `isPlayable === false`.
     - `lengthSeconds` is used only for `playlistVideoRenderer`.
     - Lockup items always get a synthesized thumbnail (`i.ytimg.com/vi/<id>/hqdefault.jpg`), so they are not dropped for lacking one.
   - **Counts.**
     - Return `{returnedCount,totalCount,unavailableCount}` on every call, appends included.
     - The header shows "Showing 93 of 100 songs. 7 are unavailable on YouTube." The append toast carries the same numbers.
     - `setPlaylistMeta` still runs only when `!isAppending` (`page.js:356-364`). The counts on an append go into the toast, not the header.
   - Whether to raise the cap is U-3.
6. **F-27, F-45, and N1.**
   - `handleFetchPlaylist` uses `mergeSongs`.
   - The existing append toast (`page.js:383-390`) reports `added` and `skipped`, for example "Added 12 songs from Chill Mix · 3 were already in the queue". It adds no second toast.
   - When every song is a duplicate, it still toasts with the skipped count.
7. **F-28 ([settled by architect]).**
   - `cleanSongTitle(title, { source, providerArtist })` skips the "Artist - Title" splitter whenever `providerArtist` is non-empty.
   - The test is the populated artist, not the source: Apple playlist tracks are structured but have no artist, so they still need the splitter.
   - The reproduction `cleanSongTitle('Kaikai Kitan - TV Size','Eve')` must yield title "Kaikai Kitan", artist "Eve".
8. **F-46.** Replace the growth of `BRACKET_NOISE_TERMS` with a structural rule.
   - The rule: a bracketed segment is dropped from the query when it contains none of the title's own non-noise tokens.
   - Verification uses the A7 diff (section 3).
   - Any diff line that changes a fixture's cleaned query must be explained in the commit message.
9. **F-47.** `PlaylistInput.js:147-158` imports `classifyInput`.
10. **F-25 (N7).** In `next.config.mjs` `headers()`:
    - Set `poweredByHeader:false`, `X-Content-Type-Options`, `Referrer-Policy`, and `frame-ancestors 'none'`.
    - The CSP is built from data:
      - `img-src`: assets.ppy.sh, a.ppy.sh, i.ytimg.com, lh3.googleusercontent.com, and the Spotify and Apple artwork CDNs (`i.scdn.co`, `*.mzstatic.com`)
      - `media-src`: b.ppy.sh
      - `connect-src`: `'self'` plus `MIRROR_HOSTS`
    - Ship it first as `Content-Security-Policy-Report-Only`. Switch it to enforcing after the client-ui preview check passes (step 2.4).
11. **Remove the optimizer surface (B3).** Set `images: { unoptimized: true }` and drop `remotePatterns`.
    - Afterwards, `curl -I "http://localhost:3000/_next/image?url=https://assets.ppy.sh/x&w=64&q=75"` must not return 200.
12. **F-50.** GitHub commits:
    - use `fetchJson`
    - rate limit it
    - set `s-maxage=120, stale-while-revalidate=300` on 200 only (N3)

### 2.2 downloads-cost

Findings: F-01, F-03, F-04, F-15, F-16, F-17, F-24, F-34, F-38, F-42, F-43, F-44, X-11.

**Severity corrections from the critique:** F-01 and F-03 are critical; F-15, F-16 and F-17 are high.

1. **F-24.** `/api/download` validates `positiveIntId` and rate limits (30 per 60 s) before contacting any mirror.
   - Remove the unused `title`, `artist` and `creator` params from the route and from the three call sites (`page.js:752`, `:819`, `:848`).
   - Remove the dead `mirror` param branch (`route.js:84-94`).
2. **F-01, relay truncation ([settled by architect]).**
   - `export const maxDuration`.
   - One overall deadline derived from it, leaving time to finish sending the body. There is no per-mirror timeout that could add up past it.
   - Pre-reject a response whose Content-Length exceeds `MAX_PROXY_ARCHIVE_BYTES`.
   - The relay counts bytes as they pass. When the cap or the deadline is reached it calls `controller.error(...)`, never `close()`, so a truncated body is never presented as complete.
   - The first chunk must start with `PK\x03\x04`.
3. **F-03 and F-04, D-10 ([settled by architect]).**
   - Delete `generateFallbackOsz` (`route.js:9-68`) and its JSZip import.
   - When every mirror fails, return **502** `{ error }`.
   - A placeholder is never produced, so none can be counted as a download.
4. **Archive predicate (`archive.js`, [settled by architect]).**
   - An archive is valid when all three hold: its size is at least `MIN_ARCHIVE_BYTES`, its head is `PK\x03\x04`, and an EOCD signature `PK\x05\x06` appears in `blob.slice(-65557)`.
   - The critic verified that a 50% truncated archive passes a head-only check, so the EOCD test is required.
   - The same function runs on the browser path and on the proxy result.
5. **F-15, X-11.**
   - Use the `mirrors.js` tables.
   - The proxy walks only `PROXY_MIRRORS`, never the browser mirrors a second time.
   - Each mirror's UA profile is data, settled by the per-mirror HEAD test (server-hardening B7).
6. **F-16, F-43, F-44.**
   - Add a batch-in-flight ref and state, declared inside `page.js:736-760`.
   - Double-click runs one loop.
   - Pacing:
     - A 200 ms minimum gap, doubling after a mirror 429 up to 5 s.
     - Our own 429 is never retried: Retry-After is not readable cross-origin, and a CORS-less 429 surfaces as a TypeError.
   - **Cancel.**
     - An `AbortController` shared by the batch.
     - The loops at `page.js:787` and `:816` check it between items.
     - `beatmapDownload.js:98` skips the proxy on `AbortError`.
     - Toast copy: "Download cancelled. 8 of 20 saved."
   - **StatsBar.** Its opacity and cursor (`StatsBar.js:160-161`, `:186-187`) key on `isBatchActive`, not the old condition.
   - The prop wiring at `page.js:947` and `:1018` is done by client-ui (A4).
7. **The proxy budget is per session, not per call.** One `createProxyBudget()` is held in a ref for the page session, replacing the calls at `page.js:785` and `:812`.
8. **F-17 ([settled by architect]).**
   - Set `MAX_ZIP_PART_BYTES = 250 * 1024 * 1024` on every device.
   - The reason is mobile. JSZip holds the inputs and the generated output at the same time, so peak memory is about twice the part size. 500 MB peak is under the per-tab ceiling that iOS Safari enforces in practice, and 1 GB peak is not.
   - Fetching stops when the next archive would overflow the part.
     1. The part is generated and saved as `osuSync-part-1.zip`.
     2. Its blobs are released.
     3. Bundling continues.
   - `streamFiles` does not bound memory, so the part cap is the only bound.
   - The `generateAsync` catch at `page.js:853` gets a toast.
   - The exact value is confirmed on a real phone (U-2).
9. **F-38 (filenames, [settled by architect]).**
   - `sanitizeStem(name, { maxCodePoints = 150 })`:
     1. Replaces `\ / * ? : " < > |` and C0 controls.
     2. Truncates the **stem only**, by code point, via `Array.from`.
     3. Only then does the caller append `.osz` or `.zip`.
   - `contentDisposition(filename)` sanitizes its own input. It writes `filename="<ascii fallback>"` plus `filename*=UTF-8''<RFC 5987 encoding>`, with `'()*` percent-encoded.
   - The critic verified two failure modes that this avoids: a 180 slice that strips the extension, and a split surrogate that throws URIError.
10. **F-34.** The last resort opens `beatmapsetPage(id)`, never a mirror that already failed. Its toast says why.
11. **F-42.** Revoke the object URL on a timeout after the click, not synchronously.
12. **DEFAULT_MIRROR.** It becomes inert. Its removal is U-4. Until that is settled, leave these references in place and do not add new ones:
    - `route.js:77`, `status/route.js:16`
    - `SetupGuideModal.js:55`, `README.md:84`, `.env.example:6`, `CLAUDE.md:38`
13. **Docs.** Update the CLAUDE.md Downloads section: no synthetic `.osz`, 502 on total failure, and the new byte cap.

### 2.3 matching-player

Findings: F-05, F-08, F-09, F-10, F-11, F-12, F-13, F-14, F-22, F-29, F-30, F-31, F-32, F-33, X-04, X-05, X-06, X-08, X-09, F-37, F-39, F-41, F-48 (reduced).

1. **F-08 and F-30 (B2, [settled by architect]).**
   - Search passes `&s=${upstreamStatusFor(statusFilter)}`.
   - The pool then filters with the single `isRankedStatus`.
   - The call count is unchanged: the same number of queries runs, only the parameter differs.
   - One live capture is allowed, within the 3-call budget. It confirms that loved and qualified sets appear and records the pool size change (U-5).
2. **F-09 and X-05 (B1, [settled by architect]).**
   - The search loop goes through `osuApiGet`, which attaches `.status`.
   - A 429 on any variant stops the loop and throws, and the route maps it through `toRouteError`.
   - If some variants returned before the 429, their pooled candidates are **not** returned as a confident result. The song is marked retryable.
   - Client (`page.js:468-487`): `!res.ok || !data.success` sets `{ hasSearched:true, isSearching:false, searchError:'rate-limited' | 'failed' }` and leaves `rejection` null.
     - The row shows "osu! is busy. Try again in a minute." with a retry control. It never shows "no beatmap".
     - Songs that fail with a 429 are retried automatically once, after the batch finishes, at concurrency 1.
   - Add `searchError` to the song contract.
3. **F-05 and X-08 (D-02).**
   - One `buildSearchRequest(song, overrides)` is used by `searchTargetSongs` and `handleManualSearch`.
   - For a manual query, the client sends `q` with `source:'query'` and no artist.
   - **[settled by architect]** The route then derives the artist and title with `cleanSongTitle(q, { source:'query' })` on the server. The client bundle does not grow, and `resolveArtistTrust` decides the trust.
   - The manual result goes through the same `isAutoSelectable` gate.
4. **F-14 ([settled by architect]).**
   - The route passes `fallbacks` through `boundedStringArray` (at most 8 items, 200 chars each).
   - In `searchOsuBeatmaps`, after dedupe, if there are more than 4 variants it keeps the first 3 and `targetTitle`.
   - The bare title is the best recall query and is never the one cut.
   - Order is otherwise unchanged, so the real loop keeps the order the bench fixtures were captured in.
5. **F-29 (B6, [settled by architect]).**
   - `scoreBeatmapMatch` keeps its return of a number or `-Infinity`, and `bench/` is not edited.
   - The loop takes the 150 early exit only when trust is `high`, or when `artistVerdict(bm, targetArtist, ...)` (already exported at `osu.js:419`) returns SAME for the leading candidate.
   - This lands only if the real-function replay (section 3, check R) shows hit ≥ 31 and calls per track ≤ 1.49. Otherwise it is deferred and recorded.
6. **F-33 (B5, D-01, [settled by architect]).**
   - Under `none` trust, salvage runs **before** reporting `artist-unknown`.
   - Salvaged results are flagged `titleOnly: true` with `matchScore: null`, and are **not** flagged `artistOverride`. Under `none` trust the string is not an artist, so "Could not find one by X" would be false.
   - `rejection` stays `{ kind:'artist-unknown', artist }`.
   - They are kept out of auto-select by `isAutoSelectable` (A8), which covers both flags at all three sites.
   - The notice copy comes from `overrideNoticeFor` → `{kind:'title'}`, rendered by client-ui as "Closest title match:".
7. **F-11 and X-04 (B3, [settled by architect]).**
   - All three osu! routes return `demoResponse()` when there is no token.
   - The client checks `data.isDemo` **before** touching `data.user` in `handlePlayerSearch` (`page.js:170`) and in `handleSelectPlayer`. It:
     - sets `errorMessage` to "Player search needs osu! API credentials."
     - calls `setIsSetupOpen(true)`, which is already declared (used at `page.js:891`)
     - clears `isLoading`
   - Delete the bespoke 503 at `player/route.js:36-42`. A null user from a real lookup is a 404 through `toRouteError`.
8. **F-13 (B4, [settled by architect]).**
   - Generations are keyed per `${userId}:${type}` in a ref map, and each key has its own `AbortController`.
   - A new load for the same key aborts the old request. Loads for different keys never interfere.
   - A `finally` clears `isLoading` for that key when the generation is still current.
   - A stale or aborted response never leaves a section stuck at `isLoading:true` (`handleToggleSection` at `page.js:285-297` can then retry).
   - Switching player aborts every key.
9. **F-12 (B10, [settled by architect]).**
   - Move `matchesCollectionFilters` and `dedupeByBeatmapset` into client-safe `collection.js`.
   - `getUserBeatmapCollection` returns the normalized, **undeduped** entries, so per-difficulty modes stay intact (`osu.js:283-286`). It also returns `fetched`.
   - `visibleItemsFor(type, entries, mode, status)` filters, then dedupes, in that order, keeping the rule's reason. It returns songs (via `beatmapToSong`), not entries.
   - **Refetch only when the upstream data differs.**
     - A mode change for `best` refetches, because `modeParam` changes which scores osu! returns.
     - Every other mode or status change is local and makes zero calls.
   - A mode change is debounced by 300 ms.
   - `reloadPlayerSections` (`page.js:300-322`):
     - no longer clears `most_played` or `favourite`
     - no longer calls `setSongs([])`
   - After each change, `selectedIds` is pruned to the visible ids, the same pattern as `page.js:607`. A hidden row can therefore never ride into a bulk download.
   - client-ui wires the call site and the Select All list (A4).
10. **F-10.** The section header shows "88 of 469" when the post-dedupe visible count is smaller than `profile.counts[type]`.
    - `total` is no longer overwritten with the truncated count.
    - The header is matching-player's element in `PlayerSections.js`: the `section.total` render inside the section header.
11. **F-22.** Paths use `encodeURIComponent(userId)` (`osu.js:272` and its siblings), and the route validates `positiveIntId`. `userId=1%2F..%2Fx` returns 400.
12. **F-31.** Handled by `toRouteError`. The 404 has a plain message and never includes the upstream path.
13. **F-32 and D-07.** `beatmapToSong` goes through `makeSong` as described in 1.2. It stays the only adapter.
    - Whatever the badge shows for `'osu-player'` is decided by client-ui. The default is no badge, the same as today's undefined source.
14. **F-39.** `artistProbeCache` becomes an LRU:
    - a cap of 200
    - a 30 minute TTL
    - a 60 s TTL for null (failed) probes
15. **F-41 (D-05).** Share only the key function (`beatmapsetKey`) between the two dedupes. They stay separate functions.
16. **F-37.** Delete `downloadUrl` (`osu.js:905`).
17. **F-48.** Reduced per D-12. The existing scoped reset stays, and the silent-append half is handled by server-hardening item 6.
    - **Rejected:** the r1 step 15 toast (B11).
18. **User-Agent.** The osu! API calls send `UA_PROFILES.server`. There is no private `withUserAgent`.
19. **Rate limits.** osuSearch is 60/60s, and osuPlayer and osuPlayerBeatmaps are 20/60s each.

### 2.4 client-ui

Findings: F-19, F-20, F-21, F-35 (reduced by D-08), F-36, F-49, X-10.

It also carries the prop wiring handed to it by A4.

1. **F-21 and F-36 (B1, B2, [settled by architect]).**
   - One `useAudioPreview` module owns a single `Audio` element. The element is created **lazily** on the first `toggle`, behind `typeof window !== 'undefined'`, following the `soundEffects.js:15` pattern.
   - **The stop rule is a mount registry, not a trigger list.**
     - Play state is keyed by what is playing: `previewKey = previewUrl`.
     - Each `BeatmapCover` registers `(previewKey, instanceId)` on mount and unregisters on unmount or key change.
     - When the last registration for the playing key goes away, playback stops.
   - This one rule covers every case the critic listed:
     - page change, filter, section collapse
     - the local re-filter, picker close, alt swap, clear list
   - It removes the ad hoc effects and the `isLoading` stop.
   - Because the alt swap and ranked narrowing change the `previewUrl` under the same `song.id`, keying on the URL is what makes them correct.
   - **Stale rejections.** Each toggle takes a token. `AbortError` and `NotAllowedError` rejections from older tokens are ignored.
   - **Error display.** The error shows through `title` and `aria-label` on the button, plus a line under the match. There is no text inside the 52-68 px cover.
2. **One source of truth for play state.** Only the parent subscribes to the hook. Rows get `isPlaying` and `isPreviewLoading` props, and covers do not subscribe.
3. **F-19.**
   - Rows are memoized.
   - Callbacks are made stable at the JSX prop sites with `useStableCallback`, using the ref plus `useInsertionEffect`; React 18.3.1 was confirmed.
   - Placing the hooks before `return (` at `page.js:888` is legal (there is no early return).
   - `handleSelectAlternativeMatch` and `handleClearList` are new functions on every render. That is harmless only because SongTable is not memoized and does not pass them to rows. The code comment must say that.
4. **F-20.**
   - Images use `loading="lazy"` and `decoding="async"` with explicit width and height.
   - Add a local reveal: a section renders its first 25 rows plus a "Show more" control. The data is already in memory, so this makes no extra fetch.
   - The `PlayerProfile.js:56` avatar gets the same attributes.
5. **F-49 and X-10 (B4, [settled by architect]).**
   - `MatchNotice.js` exports `OverrideMark` and `OverrideNotice`. Both call `overrideNoticeFor(match, song)`.
   - The mark renders only when the notice is non-null, so they are always paired.
   - Copy, with no dash anywhere:
     - `artist`: "Could not find one by <artist>. Closest match:" (current wording)
     - `closest`: "Closest match:"
     - `title`: "Closest title match:"
   - Used in SongRow (`:64`, `:228`), SongCardMobile (`:69`, `:223`) and BeatmapRow (`PlayerSections.js:123`).
   - matching-player does **not** edit these lines. Its `titleOnly` case lives inside this component.
   - X-10's `fixDirection` explicitly allows `MatchNotice` and `StatusBadge` as shared components. That clarifies, rather than violates, the "share hooks, not components" contract.
6. **BeatmapCover.**
   - `key={coverUrl}`, so `imgError` resets on an alt pick (SongRow and Mobile at `:22`).
   - A `hoverScale` prop keeps BeatmapRow's hover scale (`PlayerSections.js:152`).
7. **The A4 wiring (B3, [settled by architect]).**
   - `<StatsBar isBatchActive onCancelBatch>` at `page.js:947` and `:1018`.
   - `handleClearList` (`page.js:873-880`) aborts the batch, and resets `downloadingIds`, `isDownloadingZip` and the batch flag.
   - `<PlayerSections mode status>` at `page.js:964-972`.
   - The row map (`:486`) and Select All (`:444-450`) both use `visibleItemsFor`.
8. **F-35 (D-08).** Keep the CSS switch between the desktop and mobile trees. Do not choose a tree by `window.innerWidth`.
9. **CSP.** After merge, a preview must play with the CSP in Report-Only mode and produce no violation reports. Then server-hardening flips it to enforcing.

### 2.5 Next.js patch (last, isolated; A5)

1. Bump `next` from 14.2.35 to **15.5.26**, the patched line.
   - This is still a major bump for this repo (14 → 15), so walk the whole feature inventory afterwards. Watch for changes in:
     - the `force-dynamic` semantics
     - `fetch` caching defaults
     - async `params` and `searchParams`
     - `headers()`
2. Re-run `npm audit` and record whether postcss is now above 8.5.22. If not, see U-7.
3. Stop the dev server before the `npm run build` check, then restart it (CLAUDE.md rule).

## 3. Verification (Session 2 must run these; "lint clean" is not a gate)

`npm run lint` checks nothing: there is no ESLint config and no binary installed (A6). The gates are:

- **G1.** `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` returns 200 after every commit. This catches SSR crashes such as a module-scope `Audio`.
- **G2.** `npm test` passes (`node --test test/`).
- **G3.** `npm run bench` and `npm run bench:cost` before and after any change to `osu.js` or `matchStrictness.js`, against the baseline in the Status section.
- **R.** A real-function replay, `test/search-replay.test.mjs`. It is additive, so `bench/` is untouched.
  - It stubs `globalThis.fetch` to answer from the `bench/fixtures` snapshots, read-only, keyed by query and by probe.
  - It then calls the real `searchOsuBeatmaps` for every fixture, and asserts:
    - hit ≥ 31 and WRONG ARTIST = 0
    - total calls ≤ 55
    - with 50 fallbacks, at most 4 upstream queries are made
    - a none-trust salvage returns `titleOnly` results
    - a stubbed 429 throws `.status 429`
  - This is the only check that sees F-14, F-29, F-33, F-08's parameter, F-09 and the UA.
  - *Speculative:* this assumes the fixtures store probe responses as well as query buckets. If they do not, probes are stubbed as failed (`low` trust), and the test records the reduced coverage in its output.
- **A7.** The cleaner diff, `test/cleaner-diff.test.mjs`. It runs `cleanSongTitle` over every fixture title and compares the result with a committed snapshot taken before the change. Any change must be listed in the commit message.
- **curl checks.**
  - `/api/playlist?url=https://example.com/?x=music.apple.com` → 400, with no outbound fetch logged.
  - A nonexistent YouTube playlist → 502 with `extractionFailed`, not six songs.
  - `/api/download?beatmapsetId=999999999` → 502, `abc` → 400, `1%2F..%2Fx` → 400.
  - `/api/osu/player/beatmaps?userId=1%2F..%2Fx&type=best` → 400.
  - `userId=999999999999` → 404 with no upstream path in the body.
  - The rate limit: budget + 1 requests per route → 429 with Retry-After (N2).
  - `curl -I /` shows the security headers.
- **With credentials unset**, the three osu! routes return `isDemo:true`, and player search opens the setup guide with no crash.
- **Browser checks.**
  - A healthy id downloads with **no `/api/download` request in the Network tab** (contract 9).
  - Double-click runs one batch, Cancel stops it, and a ZIP over the part size is split.
  - Start a preview, then collapse its section: the preview stops. Open a second section: the first preview keeps playing.
  - peppy (userId 2) most_played shows "88 of 469".
- **Phone width.** Take 375 px and desktop screenshots of the song table, a player profile with a section open, and the alternative picker, using Playwright per memory. None may scroll horizontally (contract 10, D-15).

Live-call budget in Session 2: at most 3 osu! calls and 2 mirror requests per workstream, all named in its plan. `npm run bench:capture` stays off limits.

## 4. Implementation order

| step | workstream | depends on | gate |
|---|---|---|---|
| 0 | Foundation (section 2.0) | — | G1, G2, G3 unchanged |
| 1 | server-hardening (2.1) | 0 | G1, G2, A7, curl checks; CSP Report-Only |
| 2a | downloads-cost (2.2) | 0 | G1, G2, curl, Network tab |
| 2b | matching-player (2.3) | 0 | G1, G2, G3, R |
| 3 | client-ui (2.4) | 1, 2a, 2b | G1, G2, preview and phone-width checks, then flip CSP to enforcing |
| 4 | Next 15.5.26 (2.5) | 3 | full inventory walk, G1-G3, R, `npm audit` |

**Rules for the order:**

- 2a and 2b run in parallel.
- Each workstream commits in small steps, rebasing by function name.
- `page.js` ranges follow the 2-findings table, with these additions:
  - A4 hands the JSX prop sites to client-ui.
  - The auto-select sites belong to matching-player.
  - Server-hardening's handler range is 334-407.

## 5. Rejected findings and designs

| item | rejected | reason |
|---|---|---|
| F-40 parallel query variants | rejected | Parallel variants defeat the score-150 early exit and would push calls per track above 1.49 (D-04). Keep the loop sequential. |
| F-41 one dedupe function | amended | The two dedupes see different shapes (collection items vs scored candidates). Share only the key (D-05). |
| F-35 JS choice of tree by width | rejected | It causes a hydration mismatch and a flash of the wrong layout (D-08). Memo rows plus lazy images instead. |
| F-23 as an open-ended major upgrade | amended | Pin 15.5.26, the patched line, as the isolated last step (A5, D-06). |
| YouTube continuation fetching (server-hardening r1) | rejected | Dead code under the 100 cap (`youtube.js:182`). The undercount comes from the item filters (B8). |
| Keeping `generateFallbackOsz` behind a flag (D-10 option b) | rejected | A 502 is honest and simpler. The placeholder had no user value. |
| `scoreBeatmapMatch` returning `{score, verdict}` (matching-player r1 F-29) | rejected | The scratch replay dropped SHIPPED hits from 31 to 0. It would have required editing `bench/`. `artistVerdict` is already exported. |
| "s=ranked already returns approved, so F-08 is fine" (matching-player r1) | rejected | It answers the wrong question. Live, `s=ranked` drops loved and qualified. |
| Extra "Added N songs" toast (matching-player r1 step 15) | rejected | It duplicates `page.js:383-390`. |
| `titleOnly` instead of `artistOverride` with guards unchanged (matching-player r1) | amended | Kept, but only through `isAutoSelectable`, which covers both flags at all three sites. |
| Audio stop trigger list (client-ui r1) | rejected | It is a per-case list that misses collapse, re-filter and picker close, and wrongly stops on an unrelated load (B1). Replaced by the mount registry. |
| Module-scope `new Audio()` (client-ui r1) | rejected | It crashes the SSR of `/` (B2). |
| Two-prop `MatchNotice` interface (client-ui r1) | rejected | It cannot keep the mark paired with its notice for an empty artist or a `titleOnly` result (B4). |
| `src/middleware.js` rate limiter | rejected | In-handler per A1. Middleware must not ship on an unpatched Next (D-06). |
| A private `errors.js` or `withUserAgent` in matching-player | rejected | One helper layer (`http.js`, `osuRoute.js`). |
| Growing `BRACKET_NOISE_TERMS` or the unavailable-title list | rejected | Per-item special-casing (D-14). Structural rules instead. |
| A catboy-only UA switch | rejected | Special case (D-14). The UA profile per mirror is data, tested against every mirror. |
| A shared store for rate limit or GitHub cache | rejected for now | It needs a key or service (contract 6 spirit). Per-instance memory plus `s-maxage` is accepted, with the weakness recorded (D-11). |
| Global `playerRequestGenRef` (matching-player r1 F-13) | rejected | It strands concurrent sections at `isLoading` forever (B4). Replaced by a generation and abort per key. |
| Incoming-wins `mergeSongs` (matching-player r1) | rejected | It would wipe matches and selections that the user already has (B9). |

## 6. Unresolved items (for the user or for Session 2 to measure)

- **U-1. Sayobot tier.** `dl.sayobot.cn/beatmaps/download/full/{id}` sends `ACAO: *` on its 302. The 302 target (`tc1.sayobot.cn:25225`) has not been checked.
  - If the target also allows CORS, sayobot moves to `BROWSER_MIRRORS`, and more downloads avoid the function.
  - Settling it costs one mirror request. Beatconnect answers 301 with no ACAO and stays proxy-only.
- **U-2. The ZIP part size.** It is set at 250 MB on reasoning, not measurement. Confirm it on a real iPhone Safari session; lower it if the tab reloads.
- **U-3. YouTube cap of 100.** Kept, and now shown honestly. Raising it is a product call: each extra track costs about 1.49 osu! calls.
- **U-4. Removing `DEFAULT_MIRROR`.** It is inert once the mirror table lands. The recommendation is to delete the env var and its six references, but it is user-facing configuration, so it needs the user's OK.
- **U-5. Pool size under `s=leaderboard`.** The call count is unchanged by construction. The candidate pool may grow with loved sets, and the offered count may move.
  - One live capture decides whether the bench fixtures need recapturing.
  - Only the user can authorize a recapture, since `bench:capture` is off limits.
- **U-6. Artist for Apple playlist tracks.** The ld+json has no `byArtist`. Another block of the page may carry it (*speculative*: the serialized server data script). Until one is found, Apple playlist tracks match on title alone at `none` trust.
- **U-7. postcss.** If 15.5.26 does not lift the transitive postcss above 8.5.22, decide between an `overrides` entry and accepting it. It is build-time only and is not shipped to the client.
- **U-8. Qualified under `s=leaderboard`.** This is traced in osu-web, not observed. The U-5 capture should include a known qualified set.
- **U-9. Lint.** `npm run lint` is non-functional. Adding an ESLint config is out of scope for this rebuild. The user can decide whether to add one afterwards.
- **U-10. F-29 may be deferred.** It lands only if check R holds the baseline. If it does not, it goes back to MATCHING_PLAN.md as an open item.

## 7. Top findings (for the summary)

1. **F-01 (critical).** `/api/download` is an open, uncapped byte proxy with no `maxDuration`.
2. **F-02 (critical).** A substring host check lets any URL containing `music.apple.com` be fetched (SSRF).
3. **F-03 (critical).** The synthetic placeholder `.osz` is counted as a real download.
4. **F-09 and X-05 (high).** An osu! 429 is shown as "no beatmap exists".
5. **F-08 (high).** "Ranked & Loved" never asks osu! for loved or qualified sets.
6. **F-06 and F-07 (high).** Apple playlists collapse to one fake song, and YouTube failures return a fake six-song playlist as success.
7. **F-12 and F-13 (high).** Every filter change refetches every section, and stale responses land in a newer player's view.
8. **F-23 (medium, actionable).** next 14.2.35 has open critical advisories, and `/_next/image` is an open optimizer.
