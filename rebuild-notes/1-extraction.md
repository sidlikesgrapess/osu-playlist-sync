# Audit: extraction

Scope: paste/URL/query -> `/api/playlist` -> `extractMusicData` -> per-platform fetcher -> `cleanSongTitle` -> song objects handed to `page.js` (`handleFetchPlaylist`) before any osu! matching happens.
Traced files: `src/app/api/playlist/route.js`, `src/lib/extractors.js`, `src/lib/titleCleaner.js`, `src/lib/youtube.js`, `src/app/page.js:125-140,334-407`, `src/components/PlaylistInput.js` (input-parsing/platform-detection/submit parts only).
Live-verified where noted against the running dev server at localhost:3000; everything else is traced-only.

### EXT-01

```json
{
  "id": "EXT-01",
  "area": "extraction",
  "dimension": "security-abuse",
  "title": "fetchAppleMusicEntity is a server-side SSRF: any URL containing the substring \"music.apple.com\" anywhere is fetched as-is",
  "file": "src/lib/extractors.js",
  "line": 77,
  "severity": "critical",
  "evidence": "extractMusicData gates the Apple branch with `trimmed.includes('music.apple.com')` (extractors.js:188) then passes the whole raw string straight to `fetchAppleMusicEntity(trimmed)`, which does `fetch(url, {...})` with no host allowlist, no URL-object parsing, no protocol check. A substring match is not a host check: `https://example.com/?x=music.apple.com` satisfies `.includes('music.apple.com')` and is fetched verbatim.",
  "reproduction": "curl \"http://localhost:3000/api/playlist?url=https://example.com/?x=music.apple.com\" -A \"Mozilla/5.0 ...\" — the response's error text is the Apple-specific message thrown only after a real 200 OK fetch of example.com succeeded ('Could not extract tracks from this Apple Music link'), proving the server issued an outbound request to an attacker-chosen host. Live-verified this session.",
  "confidence": "verified"
}
```

Fix direction: validate with `new URL(trimmed).hostname === 'music.apple.com'` (or an allowlist of `music.apple.com`/`geo.music.apple.com`), not `.includes()`. The same pattern (`.includes('spotify.com')`, `.includes('youtube.com')`) is used for the other two branches; those happen to be safe today only because their fetchers build a *new* fixed-host URL (`open.spotify.com/embed/...`, `youtube.com/oembed`) rather than fetching the user string directly — but the routing check itself is exploit-shaped and should be fixed as one rule for all three branches, not patched only where a live exploit exists today.

### EXT-02

```json
{
  "id": "EXT-02",
  "area": "extraction",
  "dimension": "correctness",
  "title": "Apple Music playlists/albums silently collapse to one fake song (the playlist's own title) because the ld+json script-tag regex no longer matches Apple's current markup",
  "file": "src/lib/extractors.js",
  "line": 90,
  "severity": "critical",
  "evidence": "The scraper's regex is `/<script type=\"application\\/ld\\+json\"[^>]*>([\\s\\S]*?)<\\/script>/gi`, which only matches when `type=\"...\"` is the first attribute right after `<script `. A live fetch of a real Apple Music playlist page (curl against music.apple.com directly, ground truth, not through our route) shows Apple now emits `<script id=schema:music-playlist type=\"application/ld+json\">` — `id` comes first, unquoted. The regex therefore matches zero script tags even though the page's ld+json block is present and contains a full `track` array (`\"@type\":\"MusicPlaylist\",...,\"numTracks\":50,\"track\":[{...}, ...]`). `schemaData` stays null, the function falls through to the OpenGraph branch (extractors.js:119-140), and the OpenGraph title is the *playlist's* title ('Today’s Hits on Apple Music'), which has no ' by ' separator, so it is returned as a single song with that exact title and an empty artist.",
  "reproduction": "1) ground truth: curl -A \"Mozilla/5.0 ...\" -H \"Accept-Language: en-US,en;q=0.9\" 'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb' and grep for 'application/ld+json' — tag is `<script id=schema:music-playlist type=\"application/ld+json\">` with a 50-track `track` array inside. 2) curl \"http://localhost:3000/api/playlist?url=https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb\" — returns `totalSongs:1`, song title `\"Today\\u2019s Hits\"`, `channelTitle:\"\"`, i.e. the playlist name mistaken for a song. Live-verified this session (both the ground-truth curl and the round-trip through our own route).",
  "confidence": "verified"
}
```

Fix direction: make the tag match attribute-order-agnostic (e.g. `<script[^>]*type="application\/ld\+json"[^>]*>`), and treat an OpenGraph result whose title has no artist separator and whose `og:title` equals the requested collection's own name as a signal to retry/fail rather than ship it as a 1-song result — the general rule is "a fallback parser should refuse to silently stand in for a structured parser it never actually ran," not a special case for Apple's current attribute order (which can drift again).

### EXT-03

```json
{
  "id": "EXT-03",
  "area": "extraction",
  "dimension": "correctness",
  "title": "Any YouTube playlist extraction failure (bad ID, network error, markup change) is silently replaced by a hardcoded 6-song fake playlist, returned as a normal-looking HTTP 200 success",
  "file": "src/lib/youtube.js",
  "line": 45,
  "severity": "high",
  "evidence": "fetchPlaylistItems wraps both the Innertube attempt (line 55-69) and the HTML-scrape attempt (71-85) in try/catch blocks that only `console.warn` on failure, then unconditionally `return getDemoPlaylist()` at line 88 if both attempts throw or return zero songs. getDemoPlaylist() (line 267) returns a fixed 6-track 'osu! Banger Showcase' list with `isDemo:true` inside an otherwise identical `{success:true, ...}` payload shape.",
  "reproduction": "curl \"http://localhost:3000/api/playlist?url=https://www.youtube.com/playlist?list=PLthisdoesnotexist000000\" -A \"Mozilla/5.0 ...\" -> HTTP 200, `success:true`, `isDemo:true`, 6 songs titled things like 'osu! Banger Showcase'. Live-verified this session with a nonexistent playlist ID.",
  "confidence": "verified"
}
```

Fix direction: a failed extraction should surface as an error the caller can distinguish from a real (even if small) result, not as a shape-identical success payload the client has to inspect an `isDemo` flag to catch after the fact — and per EXT-06/EXT-07 below, that flag is already dropped on one whole code path.

### EXT-04

```json
{
  "id": "EXT-04",
  "area": "extraction",
  "dimension": "correctness",
  "title": "Private/deleted videos in a YouTube playlist are silently dropped with no count surfaced anywhere — the most likely mechanism behind the reported '11 songs but only 7 fetched' bug",
  "file": "src/lib/youtube.js",
  "line": 147,
  "severity": "high",
  "evidence": "Both item-shape branches in fetchFromInnertube (lines 147 and 171) and both branches in fetchFromHtmlScrape (lines 229 and 247) gate `songs.push(...)` behind `title && title !== 'Private video' && title !== 'Deleted video'`. A playlist's own item count as YouTube reports it (and as a user would count by eye) includes those rows; our `totalSongs` is `result.songs.length` *after* this filter (fetchPlaylistItems lines 62/78), so the API silently reports a smaller total with no field anywhere (`skipped`, `unavailable`, etc.) accounting for the difference. A breakcore playlist with several since-taken-down uploads (common for the genre) would show exactly this symptom: 11 items on youtube.com, 7 returned by us, no error, no indication anything was skipped.",
  "reproduction": "Traced via grep across youtube.js (4 matching filter sites, lines 147/171/229/247); not independently reproduced this session — the two real public breakcore playlists tested (31 and 26 items) round-tripped with matching counts, so they happened to contain no unavailable videos. The mechanism is verified in code; the specific user-reported 11-vs-7 case was not reproduced with a specific URL.",
  "confidence": "traced"
}
```

Fix direction: count and surface skipped items (`unavailableCount` alongside `totalSongs`) so a shorter-than-expected list is explained in the UI instead of looking like silent data loss; this is the general fix, rather than special-casing 'breakcore playlists' or any other genre.

### EXT-05

```json
{
  "id": "EXT-05",
  "area": "extraction",
  "dimension": "correctness",
  "title": "youtube.js never follows pagination/continuation tokens — both fetch paths read only the first response chunk",
  "file": "src/lib/youtube.js",
  "line": 94,
  "severity": "medium",
  "evidence": "Grep across the whole file for `continuation`/`continuationItemRenderer` returns zero matches. Neither fetchFromInnertube (94-189) nor fetchFromHtmlScrape (191-265) inspects a continuation token in the response, so any playlist whose items are split across more than one `sectionListRenderer`/`ytInitialData` page (YouTube can paginate at well under the `maxVideos=100` cap depending on shelf structure) will be truncated with no error and no way to tell from the response that more items exist.",
  "reproduction": "Traced via full read of youtube.js and grep confirmation; not reproduced with a real playlist this session (the two playlists tested were single-chunk). Secondary/compounding cause alongside EXT-04 for under-counted playlists.",
  "confidence": "traced"
}
```

### EXT-06

```json
{
  "id": "EXT-06",
  "area": "extraction",
  "dimension": "ui-glitch-parity",
  "title": "The isDemo badge (and every other playlistMeta field) never updates when a playlist is appended, so demo-fallback data injected on an append is invisible in the UI",
  "file": "src/app/page.js",
  "line": 356,
  "severity": "high",
  "evidence": "`setPlaylistMeta({... isDemo: data.isDemo})` only runs `if (!isAppending)` (page.js:356-364). The append branch's only user-facing feedback is the toast at lines 383-390, which reports counts ('N songs ... in queue') and never mentions `data.isDemo`. Combined with EXT-03 (any YouTube failure returns a same-shaped isDemo:true payload) and EXT-02 (Apple falling back to a 1-song fake result), a second 'paste' action that hits either failure mode adds fake/wrong songs to the queue with literally nothing in the UI to distinguish them from the real first batch.",
  "reproduction": "Traced by reading handleFetchPlaylist in full (page.js:334-405) and the JSX around playlistMeta.isDemo (~page.js:1000); not independently live-verified with a two-step append-then-fail sequence this session.",
  "confidence": "traced"
}
```

Fix direction: surface `data.isDemo` (and ideally a per-batch source label) on every batch, appended or not — the general rule is 'demo/fallback data is always flagged, regardless of which fetch it came from,' not 'the first fetch is flagged.'

### EXT-07

```json
{
  "id": "EXT-07",
  "area": "extraction",
  "dimension": "correctness",
  "title": "Appending a playlist does not dedupe by song id, unlike the player path's mergeSongs — pasting the same link twice (or two overlapping playlists) duplicates every shared track",
  "file": "src/app/page.js",
  "line": 375,
  "severity": "medium",
  "evidence": "`const combinedSongs = isAppending ? [...songs, ...newSongs] : newSongs;` is a plain concat. `mergeSongs` (page.js:226-233), which does dedupe incoming songs by `id` against the existing array, is only called from the player-profile path's `loadSection` (page.js:266) — `handleFetchPlaylist` never calls it.",
  "reproduction": "Traced by reading both functions in full; confirmed `mergeSongs` has exactly one call site via grep (loadSection, not handleFetchPlaylist).",
  "confidence": "traced"
}
```

Fix direction: route both append paths through the same dedupe helper — one shared rule for 'adding songs to an existing queue,' not a player-path-only special case.

### EXT-08

```json
{
  "id": "EXT-08",
  "area": "extraction",
  "dimension": "duplication-dead-code",
  "title": "Song id is synthesized twice, independently, by two different generators for the same purpose",
  "file": "src/lib/extractors.js",
  "line": 240,
  "severity": "low",
  "evidence": "extractors.js:240 does `id: song.id || \\`track_${index}_${Date.now()}\\`` before returning the song to the client. page.js:370 then does it again on every song it receives: `id: s.id || \\`track_${batchTag}_${index}\\``. Since extractors.js already guarantees a truthy id on every song object it returns (real YouTube videoId, or its own fallback), the `s.id ||` branch in page.js is dead in practice — it can only fire if extractors.js's own fallback somehow didn't (which it always does).",
  "reproduction": "Read both sites directly; extractors.js line 240 runs unconditionally over `result.songs` for every platform including query/Apple/Spotify (none of which set `song.id` upstream), so its fallback always fires first and page.js never sees a falsy id.",
  "confidence": "verified"
}
```

Fix direction: pick one place to own id generation (extractors.js, since it already runs for every platform) and have page.js trust the field instead of re-deriving it — one generator, not two independent ones that happen to agree today.

### EXT-09

```json
{
  "id": "EXT-09",
  "area": "extraction",
  "dimension": "correctness",
  "title": "cleanSongTitle's 'Artist - Title' splitter runs unconditionally for every source, including Spotify/Apple which already supply a real artist in channelTitle — causing the documented 'Re:Re:' mis-split",
  "file": "src/lib/titleCleaner.js",
  "line": 186,
  "severity": "medium",
  "evidence": "`standardMatch = text.match(/^(.+?)\\s*[-:—–|•]\\s*(.+)$/)` (line 186) runs regardless of which platform the title came from. MATCHING_PLAN.md's own Phase 4c documents this exact live bug: a Spotify track titled 'Re:Re:' is mis-split into artist 'Re' / title 'Re:' by this same colon-matching branch, and explicitly proposes gating title-splitting to YouTube-only since Spotify/Apple already hand back a trustworthy channelTitle/artist that should make splitting unnecessary for them.",
  "reproduction": "Read titleCleaner.js:113-230 (cleanSongTitle) in full; cross-referenced against MATCHING_PLAN.md Phase 4c, which documents the same bug independently. Not re-triggered live this session (would need a Spotify track literally titled with a colon like 'Re:Re:').",
  "confidence": "traced"
}
```

Fix direction: gate the split (and the cover-credit/quoted-title variants around it) on `source === 'youtube'` — Spotify/Apple already have a real artist field and splitting their title is pure downside, not a per-title exception list.

### EXT-10

```json
{
  "id": "EXT-10",
  "area": "extraction",
  "dimension": "duplication-dead-code",
  "title": "BRACKET_NOISE_TERMS mixes generic bracket noise with osu!-gameplay-specific jargon as one hardcoded vocabulary list rather than a general rule",
  "file": "src/lib/titleCleaner.js",
  "line": 7,
  "severity": "low",
  "evidence": "BRACKET_NOISE_TERMS (starting line 7) is a large flat array combining generic noise ('Official Video', 'Lyrics', 'HD') with osu!-specific gameplay jargon (mods/accuracy/pp-style terms). MATCHING_PLAN.md Phase 4a explicitly calls for shrinking this to ~15 generic entries and dropping the osu!-specific jargon, i.e. the plan itself already identifies this as special-casing that should be a general pattern-based rule instead of an enumerated list.",
  "reproduction": "Read titleCleaner.js:1-40 and cross-referenced against MATCHING_PLAN.md Phase 4a (matches its stated concern verbatim).",
  "confidence": "traced"
}
```

Fix direction: replace the flat vocabulary list with a small generic-noise set plus a pattern (e.g. bracket content matching known mod/acc/star-rating shapes) — same spirit as the repo's own 'no per-item special-casing' rule.

### EXT-11

```json
{
  "id": "EXT-11",
  "area": "extraction",
  "dimension": "duplication-dead-code",
  "title": "Platform detection is implemented twice with the same substring-match logic — client-side detection is cosmetic only and never reaches the server",
  "file": "src/components/PlaylistInput.js",
  "line": 147,
  "severity": "low",
  "evidence": "detectPlatform() (PlaylistInput.js:147-158) runs the identical `.includes('spotify.com')` / `.includes('music.apple.com')` / `.includes('youtube.com')||.includes('youtu.be')` checks as extractMusicData (extractors.js:177-199). The client's `activePlatform` (line 158) is used only for local UI (icon/label), never sent as a param — route.js (src/app/api/playlist/route.js) only reads `url`/`playlistId`/`q`, so the server always re-derives the platform itself from the same substrings.",
  "reproduction": "Grepped PlaylistInput.js for `detectPlatform`/`.includes(` (4 matches, lines 147-158) and route.js in full (27 lines, confirmed no `platform` param read).",
  "confidence": "verified"
}
```

Fix direction: this duplication is low-risk today since the server never trusts the client's value, but it means the two `.includes()` lists can drift (e.g. one gains `youtube-nocookie.com` and the other doesn't) with no shared source of truth — worth factoring into one exported `detectPlatform(str)` both sides import, especially since the server-side copy is also the one place (EXT-01) where the check is security-relevant and the client-side copy is not.

### EXT-12

```json
{
  "id": "EXT-12",
  "area": "extraction",
  "dimension": "network-hops-latency",
  "title": "No timeout on any extractor-side provider fetch — a slow/hanging Spotify, Apple, or YouTube response blocks the whole /api/playlist request indefinitely",
  "file": "src/lib/extractors.js",
  "line": 20,
  "severity": "medium",
  "evidence": "Grepped extractors.js and youtube.js for `AbortController`/`signal:`/`timeout` — zero matches in either file. Every `fetch()` call (Spotify oEmbed line 20, Spotify embed HTML line 39, Apple page line 78, YouTube oEmbed line 148, Innertube POST in youtube.js, HTML scrape in youtube.js) has no deadline, unlike the download route which CLAUDE.md documents as having an explicit 6s-per-mirror timeout.",
  "reproduction": "Grep confirmed no timeout-related tokens in either file; not independently reproduced with an artificially slow endpoint this session (would require an external slow-responding host, out of scope for live budget).",
  "confidence": "traced"
}
```

Fix direction: wrap each provider fetch in the same AbortController-based timeout pattern already used by the download route, so one slow provider can't hang a request that a user is actively waiting on.

### EXT-13

```json
{
  "id": "EXT-13",
  "area": "extraction",
  "dimension": "cost-quota",
  "title": "No bound on response body size read from provider pages before parsing",
  "file": "src/lib/extractors.js",
  "line": 47,
  "severity": "low",
  "evidence": "`await res.text()` (extractors.js:47 for Spotify embed HTML, 87 for Apple page HTML) and the equivalent in youtube.js's HTML-scrape path read the entire response body into memory with no size cap before regex-scanning it. A provider serving an unexpectedly large page (or a malicious host reached via the EXT-01 SSRF) would be read in full.",
  "reproduction": "Traced by reading the fetch/parse sites directly; not reproduced against an actual oversized payload this session.",
  "confidence": "traced"
}
```

### EXT-14

```json
{
  "id": "EXT-14",
  "area": "extraction",
  "dimension": "memory-resource-leaks",
  "title": "No findings",
  "file": "src/lib/extractors.js",
  "line": 1,
  "severity": "low",
  "evidence": "The extraction path is entirely request-scoped (no timers, listeners, caches, or long-lived handles opened outside a single request/response cycle) other than the body-size point already captured as EXT-13 under cost-quota. Nothing extraction-specific to add beyond that.",
  "reproduction": "Read all five files in full; no `setInterval`/`setTimeout`/module-level mutable state/open handles found in this area (the only module-level state in the whole app is the osu! token cache in src/lib/osu.js, which is out of this area's scope).",
  "confidence": "traced"
}
```

### EXT-15

```json
{
  "id": "EXT-15",
  "area": "extraction",
  "dimension": "rendering-performance",
  "title": "No findings",
  "file": "src/app/page.js",
  "line": 334,
  "severity": "low",
  "evidence": "The assigned page.js ranges (125-140, 334-407) contain no rendering logic — they are the input-submit handler and the fetch/state-merge handler. Row rendering (SongRow.js/SongCardMobile.js) is explicitly out of this area's file list and belongs to whichever auditor covers the table/UI area.",
  "reproduction": "Confirmed by reading both assigned ranges in full: no JSX, no list rendering, in either range.",
  "confidence": "traced"
}
```

## Summary

Counts by severity: critical 2, high 3, medium 4, low 6 (15 findings total; EXT-14/EXT-15 are explicit no-finding entries for their dimension, included per instructions to cover all 8 dimensions).

Top 3:
1. **EXT-01** — SSRF in `fetchAppleMusicEntity`: any URL containing the substring "music.apple.com" is fetched server-side as-is. Live-verified.
2. **EXT-02** — Apple Music playlists/albums collapse to a single fake song (the playlist's own name) because the ld+json regex no longer matches Apple's current script-tag markup (`id=` attribute now precedes `type=`). Live-verified against both the real Apple page and our own route; root cause pinned to one line.
3. **EXT-03** — Any YouTube extraction failure silently returns a hardcoded 6-song demo playlist as an indistinguishable HTTP 200 success, and (EXT-06/EXT-07) that flag and any dedupe are both dropped entirely on the playlist-append path, so a failure mid-session can inject fake or duplicate songs into the queue with no visible signal.

Dimensions with findings: security-abuse (1), correctness (6), ui-glitch-parity (1), duplication-dead-code (3), network-hops-latency (1), cost-quota (1), memory-resource-leaks (explicit no-finding), rendering-performance (explicit no-finding).

<!-- AUDIT COMPLETE -->
