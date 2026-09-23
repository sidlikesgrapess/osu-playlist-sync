# Critique: server-hardening (round 1)

Critic, round 1. I changed no source file. Scratch output went to the system temp dir. I made zero `/api/osu/*` calls and zero mirror calls. I made one `/_next/image` request to the running dev server (not an osu! route), one iTunes Search lookup, and one Apple Music page GET.

## What I ran (commands and results)

| # | Command | Result |
|---|---|---|
| R1 | `npm run bench` (offline) | SHIPPED: hit 31, correctAbstain 6, WRONG ARTIST 0, miss 0, unreachable 0, offered 752, hard-rejected correct 22. Matches the baseline. |
| R2 | `npm run bench:cost` (offline) | SHIPPED (src): 47 title + 8 probe = 55 calls, 1.49 per track. Matches the baseline. |
| R3 | `grep -n cleanSongTitle bench/*.mjs` | Only `bench/capture.mjs:44` and `bench/capture-probes.mjs:49` call it. `bench/run.mjs` replays the `cleaned` block frozen into each snapshot at capture time (`capture.mjs:48`). |
| R4 | `grep -rn "PLosu_banger_showcase_01\|getDemoPlaylist\|DEMO_PLAYLIST_ID" src` | `src/components/PlaylistInput.js:35` preset `preset-youtube-banger` has value `https://www.youtube.com/playlist?list=PLosu_banger_showcase_01`. It is served only by `src/lib/youtube.js:51` → `getDemoPlaylist()`. |
| R5 | `npm audit --json` (BOM stripped, parsed in node) | 1 critical (next, range `9.3.4-canary.0 - 16.3.0-preview.10`) and 1 high (postcss `<=8.5.22`, transitive through next). next `via` holds 2 critical, 8 high, 11 moderate and 2 low. Every individual next advisory's range ends at or below `<15.5.24`. |
| R6 | `npm view next@15.5 version`; GitHub advisories GHSA-2xp9-vwfh-vxw4, GHSA-p293-qw3h-jr36 | 15.5.24, 15.5.25 and 15.5.26 exist. Both critical advisories list patched versions 15.5.24 and 16.3.3. The next-14 dist-tag is 14.2.35 and is still vulnerable. |
| R7 | `curl -s -o NUL -w "%{http_code} %{content_type} %{size_download}" "localhost:3000/_next/image?url=https://i.ytimg.com/vi/<id>/hqdefault.jpg&w=64&q=75"` | `200 image/jpeg 1122`. The optimizer is live. `grep -rn "next/image" src` finds nothing. |
| R8 | `curl -sI localhost:3000/` | No CSP, X-Content-Type-Options, Referrer-Policy or X-Frame-Options headers. `X-Powered-By: Next.js` is present. |
| R9 | node: `new URL(x)` for sample inputs | `"YOASOBI: Idol"` gives protocol `yoasobi:` and host `""`. `"Re:Zero"` gives `re:` and `""`. `"Camellia: Ghost"` gives `camellia:` and `""`. All parse without throwing. `open.spotify.com/playlist/abc`, `www.youtube.com/watch?v=x` and `osu.ppy.sh/users/2` all throw. `http://open.spotify.com/...` parses. `https://u:p@open.spotify.com/` parses with host `open.spotify.com`. `https://music.apple.com./x` gives host `music.apple.com.`. |
| R10 | Read `src/components/PlaylistInput.js:140-199` | `detectPlatform` line 150 is `/osu\.ppy\.sh\/(users|u)\//` → `'player'`. `activePlatform` goes to `onFetch` (line 190). |
| R11 | Read `src/lib/youtube.js:1-250`, `src/lib/extractors.js:1-263`, `src/app/page.js:334-405` | See the items below: youtube.js:182 cap, lockup thumbnails at 229-247, extractors.js:189 `?i=`, and page.js:356-375 setPlaylistMeta and concat. |
| R12 | iTunes Search API → `trackViewUrl` for "yoasobi idol", then one GET of that Apple page, testing both regexes in node | The URL is `https://music.apple.com/us/album/idol/1688334284?i=1688334537`. The page has one ld+json tag, `<script id=schema:song type="application/ld+json">`. The old regex (extractors.js:90) matches 0 times. The plan's new regex matches with `@type: MusicComposition` in capture group 2, and there is no `track` and no `byArtist`. og:title is "Idol by YOASOBI on Apple Music". |
| R13 | grep the other plans for `fetchWithLimits`, `UA_PROFILES`, `checkLimit`, `rateLimit`, `middleware` | downloads-cost plan (lines 112-113, 173-186, 208-217) expects `UA_PROFILES.mirror` and a streaming, byte-capped Response-like `fetchWithLimits(url,{timeoutMs,maxBytes,ua,signal})`, plus "middleware or an explicit `checkLimit`" from `ratelimit.js`. The matching-player plan has no rate-limit wiring for `/api/osu/*`. |

## Blocking

B1. **The demo preset breaks, and the plan's "nothing else references it" is false.**
- Where: Target design / Changes, `youtube.js` 52, 88 and 267-318 (delete `getDemoPlaylist`).
- Evidence (R4): `PlaylistInput.js:35` ships the "osu! Banger Showcase" preset, which depends on the explicit branch at `youtube.js:51`. After the delete, the preset hits Innertube with a fake list id and returns an error.
- Contract hit: this is a lost feature, and F-07's own fix direction allows the demo "only on explicit request". That is exactly what line 51 does.
- Fix: keep the explicit-request branch and delete only the silent fallbacks (lines 52 and 88). Alternatively, replace the preset with a real public playlist in the same change.

B2. **The F-23 deferral rests on a false premise.**
- Where: plan line 27 ("there is no patched 14.x or 15.x release… The only fix is a major bump to 16.3.x") and the risk at 188.
- Evidence (R5, R6): every next advisory is patched in 15.5.24 or later, and 15.5.26 is published. The two critical RCE advisories (GHSA-2xp9-vwfh-vxw4 on image optimization, GHSA-p293-qw3h-jr36) both list 15.5.24 as patched. The plan also says severity is "lowered", but audit now reports **critical**.
- postcss (high, transitive) is not mentioned anywhere.
- F-23's fix direction says to try the newest patched release of the smallest reachable step before anything larger. 14 → 15.5.x is that step (async request APIs, fetch caching defaults), and it is much smaller than 14 → 16.
- Fix: plan the 15.5.x bump as its own isolated step, either this round or with a dated owner. Check whether 15.5.26 pulls postcss above 8.5.22. At minimum, remove the attack surface in B3 now.

B3. **`/_next/image` is an open optimizer with no use in the app.**
- Where: Changes, `next.config.mjs` (the plan adds `headers()` and leaves `images.remotePatterns` in place).
- Evidence (R7): the optimizer returns 200 for i.ytimg.com. `grep next/image src` returns nothing, so the four remotePatterns (assets.ppy.sh, i.ytimg.com, lh3.googleusercontent.com, a.ppy.sh) only enable an unauthenticated resize proxy.
- Why it matters: that proxy is the surface of the critical image-optimizer RCE class that stays unpatched under the deferral in B2. On Vercel Hobby it also spends image-transformation quota, a hidden cost the plan's Cost section omits.
- Fix: set `images: { unoptimized: true }` or drop `remotePatterns`. This is a general rule: no optimizer surface without a caller.

B4. **`classifyInput` turns ordinary text searches into 400s and pasted scheme-less links into text searches.**
- Where: Target design `platform.js` ("new URL throws → query; URL-shaped but not on the list → invalid").
- Evidence (R9): common song queries with a colon (`YOASOBI: Idol`, `Re:Zero`, `Camellia: Ghost`) parse as URLs with an empty host, so the plan's rule classes them `invalid`. That breaks feature 1, text search.
- The opposite direction also breaks: `open.spotify.com/playlist/…` and `www.youtube.com/watch?v=…` throw, so they fall to `query` and get osu!-searched as text. Today the substring routing (`extractors.js:177/188/199`) handles them.
- Other gaps:
  - `http:` is accepted even though F-02 asks for https.
  - `music.apple.com.` (trailing dot) is rejected.
  - `music.youtube.com` is present, but `www.music.youtube.com` and `spotify.link` short links are absent. Either decide on them or reject them with a message.
- Fix (general rule):
  - Treat input as a URL only if it matches `^[a-z][a-z0-9+.-]*://` or starts with a known host followed by `/`. Prepend `https://` in the latter case.
  - Only an `https:` URL whose normalized host (lowercased, trailing dot stripped) is on the allowlist is a link. A URL-shaped input that is off the list is `invalid`, and everything else is `query`.
  - Add the colon-query cases and the scheme-less cases to verification step 1.

B5. **Replacing `detectPlatform` with `classifyInput` loses osu! player auto-detection.**
- Where: Changes, `PlaylistInput.js` 147-158.
- Evidence (R10): `PlaylistInput.js:150` maps `osu.ppy.sh/(users|u)/` to `'player'`, and that value is passed to `onFetch` at line 190 to route to `/api/osu/player`. This is feature 2 in the 00-map inventory.
- The plan's `classifyInput` kinds are `spotify|apple|youtube|query|invalid`, and it has no player kind. osu.ppy.sh is not on `PLATFORM_HOSTS`, so a pasted profile URL becomes `invalid`, or `query` if it has no scheme.
- Fix: add `player` (host `osu.ppy.sh`, path `/users/` or `/u/`) to the shared classifier and keep the `selectedPlatform !== 'auto'` override.

B6. **X-01 is not fixed for the routes it was raised about.**
- Where: Target design `rateLimit.js` (wired into `/api/playlist` and `/api/github/commits` only, with osu and download "delegated").
- Evidence (R13): the matching-player plan never wires a limiter into `/api/osu/search`, `/api/osu/player` or `/api/osu/player/beatmaps`. The downloads-cost plan waits on a different name and module (`checkLimit` in `ratelimit.js`, or middleware).
- Result: the finding's main evidence (osu! token and rate exhaustion through search) stays open. 2-findings still requires "N+1 rapid requests to any /api/* route return 429", and this plan cannot meet that.
- Second problem: `checkRateLimit` always allows when x-forwarded-for is missing ('unknown'). The limiter can fail open without anyone noticing, and a local check that happens to pass proves nothing.
- Fix:
  - Own the wiring for every `/api/*` route here, or publish the exact export name and path and get both other plans to commit to calling it, with the route list and budgets in `ROUTE_BUDGETS` (download strictest, then search, then player, per X-01).
  - Bucket a missing IP as its own key instead of allowing it.
  - The plan's choice of in-handler over middleware is sound on cost. Keep it.

B7. **The `http.js` interface cannot serve the callers X-02 lists.**
- Where: Target design `http.js` (buffers `text()`/`json()` only, "for small JSON/HTML payloads", 5 MB default, no stream, no `signal`, UA key `mirrorBrowser`).
- Evidence (R13): downloads-cost streams archives through `fetchWithLimits` with `maxBytes: MAX_PROXY_ARCHIVE_BYTES`, a caller `signal` and `UA_PROFILES.mirror`. Contract 9 (capped fallback) depends on that streaming cap.
- X-02 also names osuApiGet, which needs `.status` on thrown errors per CLAUDE.md. The plan's throw-on-non-2xx must preserve that and say so.
- X-07 requires the mirror UA to be tested against every mirror. The plan just picks a Chrome string and tests it against none.
- Fix: return a Response-like object with a byte-capped `body` stream in addition to `text()`/`json()`. Accept `signal`. Settle on one UA key name with downloads-cost. Attach `.status` to errors. Put a per-mirror HEAD test in verification, within the 2-request cap or by delegating to downloads-cost.

B8. **YouTube continuations are dead code, and the 11 → 7 explanation is wrong.**
- Where: Target design, YouTube continuation following (3 pages, "~400 items"), and the F-18 diagnosis.
- Evidence (R11): `youtube.js:182` breaks at `maxVideos`, whose default is 100 (`fetchPlaylistItems(playlistId, maxVideos = 100)`). `extractMusicData` never passes a larger value, so output never exceeds 100 and the "~400" pages never render.
- The breakcore case had 11 items, and 11 items fit on the first Innertube page, so continuations cannot explain 11 → 7. The missing 4 come from the item filters (the literal 'Private video' / 'Deleted video' title checks at 147/171/229, 247 checks only 'Private', plus the lockup branch).
- Fix: re-diagnose the 11 → 7 case against the item filters. Then either raise `maxVideos` deliberately (and account for the extra osu! search fan-out: each extra track costs about 1.49 calls per R2) or drop the continuation work.

B9. **The structural "unavailable" rule is ill-defined.**
- Where: Target design, YouTube, "lacks lengthSeconds AND lacks a playable thumbnail".
- Evidence (R11):
  - `lockupViewModel` items never carry `lengthSeconds`, and their thumbnail is always synthesized as `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` (youtube.js ~229-247). The thumbnail test is therefore always true for them, and the rule depends on what "playable" means.
  - Deleted `playlistVideoRenderer` items still carry a (placeholder) thumbnail, so the rule never fires for them. They then get searched against osu!, which wastes calls.
- The rule is either never true or always true, depending on the shape. F-18's fix direction names the actual signal: `isPlayable === false`, with a missing `lengthSeconds` only on the `playlistVideoRenderer` shape.
- Fix: use `isPlayable` per shape, and add a verification that runs a playlist containing a deleted and a private video and checks the counts.

B10. **The undercount notice misses appends and does not give extraction its own flag.**
- Where: Changes, page.js 995-1010 (repurpose the isDemo badge to "Showing X of Y", counts in `setPlaylistMeta` on replace only).
- Evidence (R11): `setPlaylistMeta` runs only when `!isAppending` (`page.js:356-364`). An append that drops items (the D-13 multi-playlist feature) shows nothing, which is the silent-undercount defect F-07/F-18 cite.
- 2-findings also asks for extraction failure to get "its own flag instead of reusing the osu! demo flag". Moving the counts into the badge that `isDemo` drives (page.js:1000) still ties the two together.
- Fix: return `{returnedCount, totalCount, unavailableCount}` on every call. Surface the gap through the append toast as well as the header, and give it a field separate from `isDemo`. The copy must not use a dash as punctuation.

B11. **The titleCleaner changes cannot be measured by the bench step the plan relies on.**
- Where: Verification step 6 and Risks ("steps 6 and 7 are each benched independently").
- Evidence (R3): `npm run bench` never calls `cleanSongTitle`. It replays the `cleaned` queries frozen into each snapshot by `capture.mjs:48`. A before/after bench of F-28 or F-46 will print identical numbers whatever the change does, and `bench:capture` is off limits.
- The expected line also reads "hard-rejected correct ≥ 22". Hard-rejected correct is a failure count, so the no-regression bound is **≤ 22**. As written, the check passes a regression.
- Fix: make the D-09 query diff the real gate:
  - Dump `cleanSongTitle(rawTitle, channelTitle)` for every fixture before and after (a node script over fixture titles is offline and free).
  - Any fixture whose `cleanQuery` or `queries` changed counts as unmeasured until recaptured, and needs an explicit owner decision.
  - Correct the sign on hard-rejected correct.

B12. **The Apple fix breaks single-song share links.**
- Where: Target design F-06 (plan line 88: the OG fallback is "only entered when the URL parses as a single-track path (`/song/` or a bare release, not `/playlist/` or `/album/`)"; otherwise a failed ld+json throws).
- Evidence (R12): Apple's own canonical song link is `/us/album/idol/1688334284?i=1688334537`. The path is `/album/` and the song id is in the query string. The page's only ld+json is `MusicComposition`, and the selection at `extractors.js:97` (MusicPlaylist, MusicAlbum or `.track`) does not accept it.
- Under the plan, that link hits the `/album/` guard and throws, so the most common Apple share link stops working. Today it works through the OG fallback ("Idol by YOASOBI on Apple Music").
- `extractors.js:189` already knows `?i=` means single. The plan's path-only rule drops that.
- Fix: decide single versus collection by the parsed URL (`/song/` or `searchParams.has('i')`), accept `MusicComposition`/`MusicRecording` ld+json for singles, and throw only for collection URLs.
- Note for the implementer: the new regex moves the JSON into capture group 2, and line 91's `match[1]` must change.

## Non-blocking

N1. **Dedupe (F-27/F-45).**
- `songIdentityKey` duplicates `mergeSongs` (page.js:226-233) instead of reusing one identity function as F-27 directs.
- Positions and offset are computed before the filter.
- The toast still counts `newSongs.length` including duplicates, and an all-duplicates append gives no feedback.
- Within-batch duplicate YouTube videoIds (the same video twice in a playlist) share an id, which risks React key collisions.

N2. **Verification 8.** It sends 11 requests against a 20/60s `githubCommits` budget and expects a 429. It cannot see a 429 and will report a failure, or a false pass if someone lowers the count. It also exercises one route, when the requirement is every `/api/*` route. Use budget+1 requests per route.

N3. **F-50 cache and 429s.** A 429 or error response from `/api/github/commits` must not carry `s-maxage`, or the CDN will serve the error for 120s. Only set the header on 200.

N4. **Verification 1.** It POSTs a JSON body, but `/api/playlist` is `GET ?url=` (`route.js:18` reads the query). It also omits the spec's own case `https://example.com/?x=music.apple.com` → 400.

N5. **Line citation.** YouTube oEmbed fetch is `extractors.js:148`, not 147.

N6. **`osuApi` UA.** The UA string contains a `<owner>` placeholder. The repo is `sidlikesgrapess/osu-playlist-sync`, so fill it in.

N7. **F-25 headers.**
- Add `poweredByHeader: false` (R8 shows `X-Powered-By: Next.js`).
- The Report-Only CSP must list `img-src` for assets.ppy.sh, a.ppy.sh, i.ytimg.com, lh3.googleusercontent.com and the Spotify/Apple artwork CDNs, and `connect-src` for the browser-fetched mirrors from X-11. Enumerate them, or the enforce flip will break covers and downloads.

N8. **X-03.** State that validation runs before any upstream fetch in each route. Include the bounded string array for any route that takes a list.

N9. **Cost section.** It omits image-optimizer quota (B3) and the osu! search fan-out that more YouTube items would cause (B8).

## Verdict

**revise.** The workstream's direction is right:
- an allowlist parsed with a URL parser
- an in-handler limiter to save the edge-invocation cost
- a shared fetch helper
- no fake results

As written, though, the plan:
- deletes a shipped preset (B1)
- breaks colon-containing text search, scheme-less links, osu! player auto-detection and Apple single-song links (B4, B5, B12)
- leaves the osu! routes without a limiter (B6)
- ships a fetch helper the downloads workstream cannot use (B7)
- adds YouTube work that cannot run or cannot decide (B8, B9)
- verifies the titleCleaner changes with a bench that cannot see them (B11)
- defers a critical advisory on a false premise while leaving the optimizer open (B2, B3)

```json
{
  "verdict": "revise",
  "blocking": [
    "B1 youtube.js:51/267-318 delete of getDemoPlaylist breaks the shipped 'osu! Banger Showcase' preset at PlaylistInput.js:35 (grep R4); keep the explicit-request branch, delete only the silent fallbacks at 52/88",
    "B2 plan line 27 F-23 deferral is false: next 15.5.24+ patches every advisory incl. both critical RCEs (npm audit R5, npm view R6); audit is critical not lowered; postcss high unaddressed; plan the 15.5.x bump",
    "B3 next.config.mjs images.remotePatterns left in place: /_next/image returns 200 (curl R7) with no next/image usage in src; open optimizer is the unpatched RCE surface and Hobby image quota; set unoptimized or drop remotePatterns",
    "B4 platform.js classifyInput: new URL('YOASOBI: Idol'/'Re:Zero') parses with empty host so text search 400s; scheme-less links throw and become text queries (node R9); http accepted; trailing dot rejected",
    "B5 PlaylistInput.js:147-158 replacement drops the osu.ppy.sh/(users|u)/ player auto-detect at line 150 (read R10); classifyInput has no player kind (feature 2 lost)",
    "B6 rateLimit.js wired only into playlist and commits; matching-player plan never wires /api/osu/*, downloads-cost expects checkLimit/ratelimit.js (grep R13); X-01's core target stays open; 'unknown' IP fails open",
    "B7 http.js buffers text/json only with no stream, signal or .status, and uses the UA key mirrorBrowser, but downloads-cost streams byte-capped archives with UA_PROFILES.mirror (grep R13); X-07 mirror UA test absent",
    "B8 continuations dead: youtube.js:182 caps at maxVideos=100 default, so ~400 never happens; the 11->7 breakcore case fits one page, so the real cause is the item filters at 147/171/229/247 (read R11)",
    "B9 unavailable rule 'no lengthSeconds AND no playable thumbnail' is always or never true: lockup items never have lengthSeconds and always get a synthesized thumbnail, deleted items keep one; use isPlayable per F-18 (read R11)",
    "B10 page.js:356-364 setPlaylistMeta only on replace, so the 'Showing X of Y' notice misses appends (D-13), and it reuses the isDemo badge at page.js:1000 instead of a separate flag",
    "B11 npm run bench never calls cleanSongTitle (grep R3: only capture.mjs:44 and capture-probes.mjs:49), so titleCleaner before/after is blind; expected 'hard-rejected correct >= 22' has the wrong sign (must be <= 22)",
    "B12 plan line 88 OG guard rejects /album/ paths, but Apple's canonical song link is /album/...?i=... whose only ld+json is MusicComposition (fetched R12); single-song links would throw; key off ?i= as extractors.js:189 does; regex group moves to [2]"
  ],
  "nonBlocking": [
    "N1 songIdentityKey duplicates mergeSongs page.js:226-233; toast counts duplicates; all-duplicate append silent; within-batch duplicate videoIds collide as React keys",
    "N2 verification 8 sends 11 requests against a 20/60s budget and cannot see a 429; covers one route only",
    "N3 F-50 s-maxage must be set only on 200, never on 429 or error",
    "N4 verification 1 POSTs JSON but /api/playlist is GET ?url= (route.js:18); add the https://example.com/?x=music.apple.com -> 400 case",
    "N5 oEmbed fetch is extractors.js:148 not 147",
    "N6 osuApi UA has <owner> placeholder; the repo is sidlikesgrapess/osu-playlist-sync",
    "N7 add poweredByHeader:false (curl -I R8); enumerate CSP img-src CDNs and connect-src mirrors before the enforce flip",
    "N8 X-03: state validation runs before any upstream fetch; include the bounded string array",
    "N9 cost section omits image-optimizer quota and the osu! fan-out from more YouTube items"
  ]
}
```
