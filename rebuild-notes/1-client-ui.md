# Audit: client-ui

Scope: re-render cost of Home (page.js), list rendering/pagination, images, audio preview (dual implementation), soundEffects lifecycle, listeners/timers, and desktop/mobile/player-row parity (rejection notice, artistOverride, unavailable, alt picker, manual search, download state), plus phone-width layout.
Files traced: src/app/page.js:1-124,880-1106; SongTable.js; SongRow.js; SongCardMobile.js; PlayerSections.js:83-200,300-340; soundEffects.js; StatsBar.js; Navbar.js; OsuCheckbox.js; useScrollOffset.js; globals.css (skim).
Status: DONE

### UI-01 Home has no memoization anywhere; every completed search re-renders every mounted row

```json
{
  "id": "UI-01",
  "area": "client-ui",
  "dimension": "rendering-performance",
  "title": "Zero useCallback/useMemo/React.memo in the area; per-song search completion re-renders the whole songs array",
  "file": "src/app/page.js",
  "line": 460,
  "severity": "high",
  "evidence": "searchTargetSongs's per-completed-request handler does `setSongs(prev => prev.map(s => s.id === targetSong.id ? {...} : s))` once per finished /api/osu/search call, plus a separate `setSearchProgress(...)` call right after (page.js ~471-499); handleManualSearch does the same (line 686). Home holds 26 useState hooks with no lifted derived state. A repo-wide grep for `useCallback|useMemo|React\\.memo|memo\\(` across src/ returns exactly one hit, in HitCircleEaster.js:3,21 (its own unrelated click handler) -- SongRow, SongCardMobile, PlayerSections' BeatmapRow, and SongTable's row maps are all plain function components with no memo wrapper, and every callback passed to them (onToggleAudio, onOpenAltPicker, onManualSearch, onDownload, onToggleSelect) is a fresh closure created on every Home render. `.map` over the whole `songs` array creates a brand-new array reference every time, so React cannot bail out via Object.is on props even where a memo wrapper would otherwise help.",
  "reproduction": "Start a playlist search of N tracks with concurrency 3; each of the N completions calls setSongs (new array reference) then setSearchProgress (separate render). Every one of those renders re-executes SongTable's full paginatedSongs.map for both the desktop and mobile trees (see UI-02), i.e. every row on the current page re-renders N times over the course of one playlist search, not once each.",
  "confidence": "verified"
}
```

Fix direction: memoize SongRow/SongCardMobile/BeatmapRow with React.memo and give Home stable callbacks (useCallback) so a row only re-renders when its own song object changes, not when any sibling's search completes; this is a rebuild-wide pattern to apply everywhere row callbacks are created, not a one-file patch.

### UI-02 Desktop and mobile row trees are both always mounted, doubling row work and image fetches

```json
{
  "id": "UI-02",
  "area": "client-ui",
  "dimension": "rendering-performance",
  "title": "SongTable mounts both the desktop table and the mobile card list for every page unconditionally; CSS display:none does not stop image requests",
  "file": "src/components/SongTable.js",
  "line": 219,
  "severity": "medium",
  "evidence": "paginatedSongs.map(...) is called twice in the same render, once into a `<table>` for `.osu-table-desktop` (lines 219-232) and once into `.osu-table-mobile` (lines 240-253); which one is visible is decided purely by CSS (`globals.css` ~250-268: `.osu-table-desktop{display:none!important}` / `.osu-table-mobile{display:none!important}` flip at a 769px breakpoint). Elements with `display:none` are still fully mounted React components and browsers still issue the network request for any `<img src>` inside them, so every song's cover art and channel thumbnail is fetched twice per page regardless of viewport, and every row's local state/effects (SongRow and SongCardMobile each have their own hooks) run twice per song.",
  "reproduction": "Load the app on desktop width, run a search that produces matches, open devtools Network filtered to Img: each thumbnail/cover URL appears twice -- once for the SongRow instance, once for the SongCardMobile instance rendered in parallel and hidden via CSS.",
  "confidence": "traced"
}
```

Fix direction: pick one row tree at render time (via a resize-observer-backed viewport flag or CSS-container-query-driven conditional render) instead of mounting both, or accept the cost explicitly and add lazy-loading (see UI-03) to blunt it.

Contract check (not a finding, recorded for completeness): the "artistOverride never auto-selected" contract holds in both places that set `selectedIds` from a fresh match -- `searchTargetSongs` (page.js ~477: `if (matched && !matched.artistOverride) setSelectedIds(...)`) and `handleManualSearch` (page.js line 689, identical guard) both gate on `!matched.artistOverride` before auto-selecting. Verified by direct read of both call sites.

### UI-03 PlayerSections renders an entire open section's items at once, with no lazy-loading anywhere in the area

```json
{
  "id": "UI-03",
  "area": "client-ui",
  "dimension": "network-hops-latency",
  "title": "Up to 100 rows per open collection section render simultaneously with plain <img> tags, no loading=\"lazy\", no windowing",
  "file": "src/components/PlayerSections.js",
  "line": 486,
  "severity": "high",
  "evidence": "An explicit code comment above the map (~line 470-472) states the window is rendered in full and scrolls in place; `allItems.map(...)` at line 486 renders every item the API returned (up to the 100-item clamp documented in CLAUDE.md's 'fetch one window, paginate locally' convention) with no `.slice()`/virtualization. A grep for `loading=|decoding=|next/image|<Image` across src/components turns up zero real hits -- the only matches were the substring `isDownloading` in prop names (SongTable.js:228,249; PlayerSections.js:499), a false positive. So every cover image in every open section (best/most-played/favourites, i.e. up to ~300 images if all three are expanded) is requested immediately and eagerly, none deferred by the browser's native lazy-loading.",
  "reproduction": "Open a player profile with a large most-played or favourites list, expand the section, and watch the Network tab: all rows' cover images fire at once on section-open rather than as they scroll into view. This directly confirms the todo file's own open question ('are we loading every image and beatmap for the player search at once? is it expensive?') -- yes.",
  "confidence": "traced"
}
```

Fix direction: add `loading=\"lazy\"` to every `<img>` in the area as a first, near-free step; windowing/virtualizing the open section is the fuller fix the todo already anticipates ('dynamic scroll based loading').

### UI-04 Audio preview is implemented twice, independently, with no shared lock

```json
{
  "id": "UI-04",
  "area": "client-ui",
  "dimension": "duplication-dead-code",
  "title": "SongTable and PlayerSections each own a separate activeAudio/audioRef/handleToggleAudio instead of sharing one preview module",
  "file": "src/components/PlayerSections.js",
  "line": 313,
  "severity": "medium",
  "evidence": "SongTable.js (~lines 29-62) and PlayerSections.js (lines 313-333) each define their own `activeAudio` state, `audioRef`, `handleToggleAudio` (creates `new Audio(previewUrl)`, same play().catch(...)->setActiveAudio(null) shape) and their own unmount-cleanup effect. Nothing is shared between them -- no singleton, no context, no module-level lock. The only reason two previews cannot play at once today is that page.js renders SongTable and PlayerSections mutually exclusively on the `playerProfile` flag (~lines 930-1055), not because the audio logic itself prevents it.",
  "reproduction": "Not independently reproducible today since the two views never co-render, but any rebuild that shows a player result list and the playlist table together (or extracts BeatmapRow for reuse elsewhere) inherits two independent audio players with no coordination, and would need the fix applied in two places since neither file is aware of the other's state.",
  "confidence": "traced"
}
```

Fix direction: factor the preview-toggle logic into one hook/module (e.g. a `useAudioPreview()` shared by both files) so there is exactly one place that owns `activeAudio` and enforces at most one playing preview, however many lists exist.

### UI-05 Audio preview has no loading or error UI, and can keep playing after its row leaves the visible list

```json
{
  "id": "UI-05",
  "area": "client-ui",
  "dimension": "correctness",
  "title": "Preview playback state (activeAudio) is not reconciled against pagination/filter changes, and playback failures are silently swallowed",
  "file": "src/components/SongTable.js",
  "line": 47,
  "severity": "high",
  "evidence": "handleToggleAudio's `.play().catch(e => { console.warn(...); setActiveAudio(null); })` (SongTable.js ~47-50; PlayerSections.js ~326 does the same with an empty catch) reverts the button to its idle icon on failure with no visible error state, and there is no intermediate 'loading/buffering' state between click and playback -- this is exactly the todo's open item ('song preview should show a loading or errors. (network)'). Separately, `activeAudio`/`audioRef` are local to SongTable and are never reset when `paginatedSongs` or `filteredSongs` changes (changing page or typing in the filter box does not touch this state at all) -- if the currently-previewing song's row scrolls out of the current page or gets filtered out, the underlying `Audio` object keeps playing in the background with no row left on screen showing a pause control for it.",
  "reproduction": "Start a preview on a song on page 1, then change to page 2 (or type into the filter box so that song's row is excluded): audio keeps playing, but no rendered row anywhere still shows the 'now playing' icon for it, and there is no longer any button that will pause it -- the only way to stop it is to play a different preview or reload.",
  "confidence": "traced"
}
```

Fix direction: reset (pause + clear) `activeAudio` whenever `paginatedSongs`/`filteredSongs` changes to exclude the currently-playing id, and surface both a brief loading state and a visible error affordance instead of only a console.warn.

### UI-06 PlayerSections' BeatmapRow shows the artistOverride mark without the paired explanatory notice

```json
{
  "id": "UI-06",
  "area": "client-ui",
  "dimension": "ui-glitch-parity",
  "title": "BeatmapRow renders the artistOverride \"!\" indicator but never the \"Could not find one by X. Closest match:\" notice, and passes no unavailable prop to OsuCheckbox",
  "file": "src/components/PlayerSections.js",
  "line": 123,
  "severity": "low",
  "evidence": "PlayerSections.js lines 123-130 render the same red exclamation-mark indicator for `matchedBeatmap?.artistOverride` that SongRow.js (lines 64-71 mark, 228-236 notice) and SongCardMobile.js (69-76 mark, 223-227 notice) render, but BeatmapRow has no equivalent notice text anywhere in the file, and its OsuCheckbox usage (lines 114-121) passes neither `unavailable` nor `disabled`. The contract in CLAUDE.md is explicit: 'showing it without the notice... defeats the point.' Today this is latent rather than live: page.js's `beatmapToSong` (~lines 34-46) builds player-path songs directly from the user's own osu collection item and never runs them through scoreBeatmapMatch, so `matchedBeatmap.artistOverride` should always be falsy on this path and the mark should be unreachable in practice.",
  "reproduction": "Not reproducible against the live app today (the flag can't currently be set on a player-path song); confirmed by reading BeatmapRow's render branch directly against SongRow/SongCardMobile's paired mark+notice implementation.",
  "confidence": "traced"
}
```

Fix direction: either delete the now-dead artistOverride mark from BeatmapRow to stop it silently violating the contract if a future change ever routes player-path matches through the scorer, or give it the same paired notice text as the other two renderers so the contract holds uniformly across all three.

### UI-07 songs (and their cover art / preview URLs) accumulate across searches with no automatic cleanup

```json
{
  "id": "UI-07",
  "area": "client-ui",
  "dimension": "memory-resource-leaks",
  "title": "New playlist/track/player searches append to the existing songs array rather than replacing it; nothing is released until the user explicitly clears the list",
  "file": "src/app/page.js",
  "line": 880,
  "severity": "medium",
  "evidence": "Per rebuild-notes/00-map.md's traced song-object lifecycle (song-merge accumulates by id rather than clearing), successive playlist/track searches grow `songs` rather than replacing it, and the only way to shrink it is the explicit 'Clear list' action surfaced through StatsBar. Every entry retained this way keeps its thumbnail URL, beatmap cover URL and preview URL live in state, so SongTable/SongCardMobile/SongRow keep those `<img>`/`<audio>` sources mounted (subject to UI-02's double-mount) for as long as the entry sits in the array, however many searches ago it was added. This is the exact scenario the project's own todo file names unresolved: 'memory leak? the cached beatmaps and pics have to be deleted when the user pulls up a new search or player search.'",
  "reproduction": "Run several successive playlist searches without hitting Clear list; songs.length only grows, and every previously-searched song's images stay in the DOM (paged out of view, not unmounted) rather than being released.",
  "confidence": "traced"
}
```

Fix direction: decide, per entry point (new playlist paste vs. new player profile lookup), whether the prior list should be replaced rather than merged -- the merge behavior appears intentional for multi-playlist queuing (todo: 'popup notification... on adding playlists after the first one'), so the fix is likely a scoped reset only for the player-search entry point, not a blanket clear.

### UI-08 Phone-width (375px) layout traced clean; no horizontal-scroll bug found

```json
{
  "id": "UI-08",
  "area": "client-ui",
  "dimension": "ui-glitch-parity",
  "title": "No horizontal-scroll issue found at phone width, traced from CSS rather than screenshotted live",
  "file": "src/app/globals.css",
  "line": 35,
  "severity": "low",
  "evidence": "globals.css sets `overflow-x: hidden` and `max-width: 100vw` at the body/root level (lines 35-36) as a structural guard, in addition to the 769px desktop/mobile table-swap breakpoint (~250-268) and a dedicated 480px breakpoint (lines 272-283) that further compacts the search bar (hides label text/chevron text, shrinks button padding) for narrow phone widths. No component in the assigned list sets a fixed pixel width or negative margin that would fight these guards.",
  "reproduction": "Not run against the live server (traced from CSS only, per the task's fallback instruction, to stay within the shared dev-server/API-call budget); a real screenshot at 375px would be the stronger confirmation if budget allows in a follow-up pass.",
  "confidence": "traced"
}
```

## Dimensions with no findings

- **cost-quota**: every image in this area is a plain `<img>` pointed directly at an external CDN (osu!/YouTube/Spotify/Apple thumbnails); nothing routes through `next/image` or a server-side proxy, so none of it consumes Vercel image-optimization or function-invocation budget. The one live osu!-API cost lever this area controls (search fan-out concurrency of 3, `src/app/page.js`) was already fixed before this audit and is out of scope for change here. See UI-03 for the client-side (not Vercel-billed) bandwidth cost of the same images.
- **security-abuse**: every `target="_blank"` link in the assigned files (`SongRow.js:439`, `SongCardMobile.js:405`, `PlayerSections.js:258`, `Navbar.js:181`, `page.js:1066`) carries `rel="noreferrer"` or `rel="noopener noreferrer"` -- no reverse-tabnabbing gap. Grepped the same files for `dangerouslySetInnerHTML`, `eval(` and `innerHTML`: zero hits. This area has no auth/trust boundary of its own; input validation for search queries and downloads happens server-side in the API routes, which are a different auditor's area.
- **memory-resource-leaks (partial)**: `useScrollOffset.js` (Navbar's scroll listener) is clean -- rAF-throttled, registered with `{ passive: true }`, and removed in the effect's cleanup function; it also stops calling setState once past its threshold. `soundEffects.js`'s `AudioContext` is a deliberate long-lived singleton (never explicitly closed), which is a defensible pattern for a page-lifetime SFX engine rather than a leak, and is not flagged as a finding. The remaining exposure in this dimension is UI-07.

## Summary

Severity counts: high 3, medium 3, low 2 (8 findings total: UI-01 through UI-08).

Top 3 findings:
1. **UI-01** (high, rendering-performance) -- no memoization anywhere in the area; a single playlist search re-renders every mounted row once per completed request rather than once total.
2. **UI-03** (high, network-hops-latency) -- PlayerSections renders an entire open collection section (up to ~100 items) at once with zero `loading="lazy"` anywhere in the codebase, so opening a section fires every one of its image requests immediately.
3. **UI-05** (high, correctness) -- audio preview state is never reconciled against pagination/filtering, so a playing preview can outlive its own row with no remaining UI control to stop it, and playback failures are only a `console.warn` with no user-visible error or loading state.

<!-- AUDIT COMPLETE -->
