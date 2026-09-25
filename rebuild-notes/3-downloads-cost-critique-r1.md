# Critique: downloads-cost (round 1)

Critic, round 1. Plan under review: `rebuild-notes/3-downloads-cost-plan-r1.md`. Line numbers are at the
current working tree (source unchanged since bdc6990 on branch `rebuild`).

## What I ran (commands and results)

- Read the plan (all 290 lines), 2-findings.md header, Workstreams table and the owned findings
  (F-01, F-03, F-04, F-15, F-16, F-17, F-24, F-34, F-38, F-42, F-43, F-44, X-11) plus X-01, X-02, X-07.
- Read `src/app/api/download/route.js:68-166`, `src/lib/beatmapDownload.js` (all 116 lines),
  `src/app/page.js:728-882`, `src/components/StatsBar.js:140-200`.
- `npm run bench`: SHIPPED (src) block = hit 31, correctAbstain 6, WRONG ARTIST 0, miss 0, unreachable 0,
  correct maps offered 752, hard-rejected correct 22. `npm run bench:cost`: SHIPPED 47 + 8 = 55 calls,
  1.49/track. Baseline reproduced; the plan touches nothing bench imports, so this is only a pre-check.
- Node script in scratchpad (`t1.cjs`) copying the plan's `hasZipMagic`/`isValidArchiveBlob`/
  `sanitizeFilename`/`contentDisposition` verbatim, with an archive built by the project's own jszip:
  - full archive: valid true. **Archive truncated at 50%: plan predicate says valid = true.** An
    End of Central Directory check (`PK\x05\x06` in the last 65557 bytes) says false. HTML body: false.
  - id regex `^[1-9]\d{0,9}$`: rejects `abc`, `-1`, `1/../x`, `0`, `01`, `1\n`, full-width digits, `1e3`,
    11 digits; accepts `123`, `9999999999`. Correct.
  - `sanitizeFilename` on a 230-char `"<id> <artist> - <title>.osz"`: length 180, **ends with `.osz`: false**.
    Name with an emoji straddling char 180: **slice leaves a lone high surrogate**, and
    `encodeURIComponent('\ud83d')` throws `URIError: URI malformed` (so `contentDisposition` throws).
  - `contentDisposition('a"b\c')` (unsanitised input) produces `filename="a"bc"`: a broken quoted-string.
    `encodeURIComponent("it's (x)*")` gives `it's%20(x)*`: `'`, `(`, `)`, `*` are not RFC 5987 attr-chars.
  - `typeof AbortSignal.any` in Node 24.19: function.
- `node --test` in an empty scratch dir: 0 tests, fail 0, exit 0. It cannot detect a failure on its own.
- Mirror requests (2 of 2, HEAD, browser UA):
  - `https://dl.sayobot.cn/beatmaps/download/full/1` → `302`, `Location: https://tc1.sayobot.cn:25225/...`,
    **`Access-Control-Allow-Origin: *`**.
  - `https://beatconnect.io/b/1` → `301` to `/b/1/`, `text/html`, no ACAO.
- Grep: `3-client-ui-plan-r1.md` for `isBatchActive|onCancelBatch|StatsBar` → no hit.
  `DEFAULT_MIRROR` → route.js:77, `src/app/api/status/route.js:16`, `SetupGuideModal.js:55` (via
  `defaultMirror`), README.md:84, .env.example:6, CLAUDE.md:38. `MAX_ZIP_BYTES` in the plan: named at
  lines 20, 161, 212, **never given a value**. `StatsBar` rendered at page.js:947 and page.js:1018.
- Live osu! calls: 0 of 3 used. No build, no dev server restart, no source edits.

## Blocking

1. **Relay can be cut mid-body and still be counted as a real .osz (Changes by file, route.js bullets
   "Lines 103-120" and "Add maxDuration"; Target design `archive.js`).** Per-mirror `timeoutMs: 4000` times
   two mirrors inside `maxDuration = 10` leaves as little as 2s to stream a 10-50MB body. There is no single
   deadline covering headers plus body, which F-15's fixDirection asks for ("one overall deadline under
   maxDuration instead of 6s times N"). When the byte cap or the deadline stops the relay, the plan does not
   say the stream is *errored* rather than closed. If it closes cleanly (chunked, no upstream
   Content-Length), `fetchBlob` (beatmapDownload.js:73-81) returns the partial blob. `isValidArchiveBlob`
   only checks the first 4 bytes and the 10KB minimum, and I ran a 50% truncated archive through it: valid
   = true. That is contract 9 ("never reports a placeholder as a real download") and the F-03/F-04 goal
   broken by a different route. Fix in general form: one deadline for the whole request, derived from
   `maxDuration` and leaving time to relay the body. Pre-reject `Content-Length > MAX_PROXY_ARCHIVE_BYTES`.
   Error the relay stream (`controller.error`) on cap or deadline, never close it. Make the one archive
   predicate structural at both ends: head magic plus an EOCD record in the tail. That is one extra
   `blob.slice(-65557)` in the browser and costs nothing on the server.
2. **F-17 (high) is not specified enough to implement (Changes by file, page.js `handleDownloadZipBatch`
   bullet).** `MAX_ZIP_BYTES` has no value anywhere in the plan. On the cap, the plan quietly produces a
   *partial* ZIP. The fixDirection says "split into multiple ZIPs, or refuse with a message", and the
   2-findings verification says "a ZIP over the cap is refused with a message". Silently truncating takes
   away the ZIP feature (00-map inventory #12) for large selections that work on desktop today. The plan
   also does not say that the loop stops *fetching* once the cap is hit, so it keeps pulling archives from
   volunteer mirrors only to throw them away. Give the number (with a mobile rationale). Stop fetching at
   the cap. Then either split into numbered parts or refuse up front, with copy that uses no dash.
   `streamFiles: true` does not bound memory with `type: 'blob'`: the whole output is still built in
   memory. Say that the cap is the only memory bound.
3. **The cross-workstream interface for F-16/F-44 was never agreed (Changes by file, StatsBar; Implementation
   order step 5).** `isBatchActive` and `onCancelBatch` have to be passed at both StatsBar call sites,
   page.js:947 (player view) and page.js:1018 (playlist view). Both sit in client-ui's JSX ranges.
   `3-client-ui-plan-r1.md` never mentions either prop (grep: no hit). As written, the Cancel button never
   renders, so F-44 ships as dead code. The Download button also never shows as disabled: only the ref
   guard stops a second click, so the button looks live and does nothing. Get a line added to client-ui's
   plan, or have 2-findings grant downloads-cost those two prop lines. Either way, name both sites.
4. **`sanitizeFilename` adds a filename bug (Target design `filename.js`; page.js bullet "filename
   construction uses sanitizeFilename ... instead of the inline regex").** The inline regex it replaces is
   applied to the whole string including `.osz` (page.js:752, 819). A drop-in swap therefore runs
   `.slice(0, 180)` on the extension. I ran it: a long title saves without `.osz`, and osu! will not import
   it on double-click. The slice also splits surrogate pairs, and `contentDisposition` then throws
   `URIError`, which becomes a 500 in route.js. Sanitise and truncate the stem only, by code point, then
   append the extension. Have `contentDisposition` sanitise its own input, and percent-encode `'()*` for
   RFC 5987.

## Non-blocking

- **Findings table labels are wrong.** In 2-findings, F-01 and F-03 are critical (the plan says high) and
  F-15/F-16/F-17 are high (the plan says med). F-24 is the beatmapsetId validation (medium), not "dead
  mirror param". X-11 is the one mirror table, not the byte cap. X-07 belongs to server-hardening, not
  here. All 13 owned ids are covered in substance, but the table misstates what each id is.
- **`DEFAULT_MIRROR` becomes inert with nothing said.** Deleting route.js:77-96 removes the only thing
  `DEFAULT_MIRROR` affects. `/api/status:16` and `SetupGuideModal.js:55` still show it to the user as the
  "default mirror", and README.md:84, .env.example:6 and CLAUDE.md:38 still document it. Either remove it
  everywhere (the status route is outside owned files, so coordinate that) or keep it as a proxy-order
  hint. Also update CLAUDE.md "Downloads" (fallback-generator, four mirrors, 6s), which the plan leaves
  stale.
- **The sayobot URL changes without a word.** The plan changes it from `direct.sayobot.cn/osu/{id}`
  (route.js:88) to `dl.sayobot.cn/beatmaps/download/full/{id}`. I verified that the new URL sends
  `Access-Control-Allow-Origin: *` on its 302. If the final hop (`tc1.sayobot.cn:25225`) does too, sayobot
  belongs in the browser tier, which means fewer proxy invocations. X-07 and X-11 say to classify each
  mirror by testing it, not by carrying over a comment. Also, `MIRROR_HOSTS` as the CSP source
  (F-25) must include redirect targets such as `tc1.sayobot.cn:25225`, or CSP blocks the redirected fetch.
  If `next.config.mjs` imports `src/lib/mirrors.js` in a package without `"type": "module"`, that relies
  on Node's ESM syntax detection. Pin the Node version, or make it `.mjs`.
- **F-43 backoff mostly cannot fire.** `Retry-After` is not a CORS-safelisted response header, so
  `res.headers.get('Retry-After')` returns null on catboy and nerinyan unless they send
  `Access-Control-Expose-Headers`. A 429 served without ACAO is a TypeError with no readable status. The
  only 429 the client reliably sees is our own limiter's, and retrying that wastes another function (and
  middleware) invocation. Do not retry same-origin 429 when `Retry-After` exceeds the cap.
- **Cancel semantics are not specified.** After `abort()`, the batch and ZIP loops (page.js:787, 816) must
  break on `signal.aborted`. Otherwise every remaining song fails at once and the end toast says "could
  not be fetched. The mirrors may be busy" (page.js:798), which is untrue. The CORS `catch`
  (beatmapDownload.js:98) also treats an AbortError as "try next mirror" and falls through to the proxy,
  spending budget. Bail out on abort before the proxy step. Make the 429 wait abortable too.
- **StatsBar only updates `disabled`.** The plan changes `disabled` at 152 and 179, but opacity and cursor
  at 160-161 and 186-187 still use the old condition, so a disabled button looks enabled.
- **F-16's fixDirection has two parts.** It asks for "one fallback budget per session window rather than
  per click". The plan still creates `createProxyBudget()` per call (page.js:785, 812), so back-to-back
  batches each get 5.
- **F-34's fixDirection asks for a toast.** "Show the failure in the toast either way". The plan only
  changes the tab target, so a failed single download still gives no toast. Also, `window.open` after an
  awaited fetch is often popup-blocked, and a toast would cover that case.
- **F-38 has three client call sites.** They are page.js:752, 819 and 848, and the page.js bullet names
  only the single-download one. Also, no client sends `title`/`artist`/`creator` to the route
  (`proxyUrl`, beatmapDownload.js:31, sends only the id), so the route's filename is always
  "Unknown - Beatmap". Drop those params rather than dressing them up with `filename*`.
- **Shared-file rules are not followed to the letter.** New batch state must be declared inside 736-760
  (2-findings:46), and the plan does not say where it goes. New imports cannot go in lines 1-20 (client-ui),
  so put them on line 21 in place of the JSZip import. `mirrors.js` and `archive.js` are not in the
  owned-files list, so register them.
- **The rate-limit interface is invented.** `src/lib/ratelimit.js`/`checkLimit` is not in X-01, which
  specifies `src/middleware.js`, and not in server-hardening's owned files. If neither lands, F-01 ships
  with no per-IP limit at all. The byte and time cap is the real bound, but state that outcome explicitly.
- **The verification cannot catch several failures.**
  - It drops the 2-findings checks for `beatmapsetId=999999999` (the direct F-03 test), for
    `1%2F..%2Fx`, for "over the per-IP budget returns 429", and for "healthy id: no `/api/download` in the
    Network tab" (contract 9).
  - `node --test` with no test file passes, and so does `require('./src/lib/archive.js')`: nothing is
    asserted. Write a real `*.test.mjs` covering the truncated-archive, HTML and short-chunk cases.
  - `/tmp/out.osz` read from `node` on Windows resolves to `C:\tmp`, not Git Bash's `/tmp`.
- **`generateAsync` failures stay silent.** The catch at page.js:853 logs and shows no toast. It is inside
  the owned range, so add a message.

## Verdict

Revise. The core direction is right: delete the placeholder, validate the id, use one archive predicate,
use one mirror table, and cap the proxy. But the cap as designed can still deliver a truncated archive
that the predicate accepts. F-17 has no number and changes ZIP behaviour. The F-16/F-44 UI half depends
on a prop handoff that client-ui has not agreed to. The new filename helper strips `.osz` from long names.

```json
{
  "verdict": "revise",
  "blocking": [
    "Relay cut by byte cap or maxDuration can close cleanly and a head-only isValidArchiveBlob accepts a truncated archive (verified 50% truncation passes); need one overall deadline, errored stream, Content-Length pre-reject, EOCD tail check",
    "F-17: MAX_ZIP_BYTES has no value; over-cap produces a silent partial ZIP instead of split or refuse; loop keeps fetching past the cap",
    "isBatchActive/onCancelBatch must be wired at page.js:947 and :1018 (client-ui range) but client-ui plan r1 never mentions them; Cancel is dead and Download never shows disabled",
    "sanitizeFilename slice(180) on the full name strips .osz (verified) and can split a surrogate pair so contentDisposition throws URIError"
  ],
  "nonBlocking": [
    "Findings table severities and ids mislabelled (F-01/F-03 critical, F-15-17 high, F-24 is id validation, X-07 not owned, X-11 is the mirror table)",
    "DEFAULT_MIRROR made inert but still shown by /api/status and SetupGuideModal and documented in README, .env.example, CLAUDE.md; CLAUDE.md Downloads section goes stale",
    "sayobot URL changed silently; dl.sayobot.cn sends ACAO * (verified) so it may belong in the browser tier; CSP from MIRROR_HOSTS must include redirect targets",
    "Retry-After is not CORS-readable and CORS-less 429s are TypeErrors; retrying our own 429 wastes an invocation",
    "Cancel must break the loops and skip the proxy on AbortError, with cancel-specific copy",
    "StatsBar opacity/cursor still keyed on old condition",
    "F-16 per-session proxy budget not addressed",
    "F-34 failure toast not added",
    "F-38 misses page.js:819/848 in the bullet; route title/artist/creator params are unused and could be dropped",
    "New state location and import line not stated per shared-file rules; mirrors.js/archive.js not registered as owned",
    "ratelimit.js/checkLimit interface invented; X-01 specifies middleware",
    "Verification omits 999999999, 1%2F..%2Fx, 429-over-budget and no-proxy-in-Network-tab checks; node --test with no test file passes vacuously",
    "generateAsync failure at page.js:853 has no toast"
  ]
}
```
