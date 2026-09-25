# Plan: client-ui (round 1)

Baseline commit for line numbers: bdc6990 (per 2-findings.md Workstreams table); all
citations below were re-read directly from the working tree during planning, not taken
from the summary alone. This workstream lands last, so it rebases onto the other three
workstreams' `page.js`/`PlayerSections.js` edits by function name, not by line number.

## Findings resolved

| id | severity | fix |
|---|---|---|
| F-19 | medium | `React.memo` on `SongRow`, `SongCardMobile`, extracted `BeatmapRow`; stabilize every callback prop threaded through them (`useStableCallback` at the `page.js` JSX sites for handlers owned by other workstreams, plain `useCallback`/direct setter passthrough for handlers `client-ui` owns) so a per-song `setSongs` update re-renders only that song's row |
| F-20 | medium | `loading="lazy" decoding="async"` + explicit `width`/`height` on every cover/thumbnail/avatar `<img>` (`SongRow`, `SongCardMobile`, `BeatmapRow`, alt-picker, `PlayerResults` avatars) |
| F-21 | medium | new `src/lib/useAudioPreview.js` hook exposes `isLoading(id)`/`isError(id)` in addition to `isPlaying(id)`; all three row renderers show a loading spinner and a dash-free error string |
| F-35 | medium | resolved as a side effect of the F-20 fix: `loading="lazy"` on the always-mounted hidden tree means the `display:none` half of `.osu-table-desktop`/`.osu-table-mobile` never triggers a fetch (kept as the CSS switch, per D-08 — no JS width branching) |
| F-36 | medium | delete both local audio implementations (`SongTable.js:29-62`, `PlayerSections.js:313-333`); replace with the one shared `useAudioPreview.js`, a module-level singleton so `SongTable`, `PlayerSections` and the alt-picker (three separate call sites) can never play two previews at once |
| F-49 | low | new `src/components/MatchNotice.js` renders the `!` mark and its notice line as one unit; `BeatmapRow` switches to it, structurally closing the gap instead of just adding a notice by hand |
| X-10 | low | achieved structurally by the F-36/F-49 fixes plus a new shared `src/components/BeatmapCover.js` and `src/components/StatusBadge.js` — parity is enforced by sharing the piece, not by a checklist |

No owned finding is being skipped. All seven are medium/low and every fixDirection in
`2-findings.md` was reproducible from the current code (each file:line cited below was
read directly this session).

## Target design

**New files (all under `client-ui` ownership, no new dependency):**

- `src/lib/useAudioPreview.js` — one module-level `Audio` element and one `Set` of
  React-state listeners, shared by every importer. Exports `useAudioPreview()` returning
  `{ isPlaying(id), isLoading(id), isError(id), toggle(id, url), stop() }`. `toggle` and
  `stop` are module-scoped functions, so their identity never changes across renders or
  across the three call sites — no `useCallback` needed for them, which also means
  `React.memo` on the rows is never busted by the preview wiring.
- `src/lib/useStableCallback.js` — ref-backed wrapper (`useInsertionEffect` to update the
  ref before paint, `useCallback(() => ref.current(...args), [])` for the stable
  identity). Used only at JSX prop-wiring sites; the handler bodies it wraps are never
  touched.
- `src/components/MatchNotice.js` — `{ artistOverride, extractedArtist }` in, renders the
  red `!` mark's sibling notice line (`Could not find one by {artist}. Closest match:`)
  as a single exported piece so a consumer can't render one half without the other.
- `src/components/StatusBadge.js` — thin wrapper around `getStatusBadgeStyle` from
  `beatmapFormat.js`, replacing the 4 duplicated inline `<span style={statusStyle}>` call
  sites (`SongRow`, `SongCardMobile`, `BeatmapRow`, alt-picker).
- `src/components/BeatmapCover.js` — `{ coverUrl, alt, width, height, id, previewUrl }` in;
  renders the lazy cover image plus the play/pause/loading/error overlay button, backed by
  `useAudioPreview()` internally. Replaces the 4 near-identical cover+preview-button blocks
  (`SongRow.js:240-301`, `SongCardMobile.js:238-290`, `PlayerSections.js:134-188`,
  `SongTable.js:518-564`).

**Memoization:** `SongRow` and `SongCardMobile` become `export default React.memo(function
...)`; `BeatmapRow` (currently a local function inside `PlayerSections.js`, not exported)
gets the same `React.memo` wrap in place. No custom comparator — every prop reaching these
components is already, or is made by this plan, a primitive or a stable reference (see
"Changes by file"), so the default shallow comparison is sufficient and keeps the fix
general rather than a special-cased list of props to compare.

**Why memo works despite `page.js` replacing the array every time:** `searchTargetSongs`'s
per-completion update (`src/app/page.js:471-490`) and every other per-song update in the
file (`page.js:673`, `686`, `862`; verified by grep, listed below) follow the same
`setSongs(prev => prev.map(s => s.id === targetId ? {...s, ...} : s))` shape — the changed
song gets a new object, every other song keeps its exact reference (`return s`). `songs` is
a new array every time, so `SongTable`/`PlayerSections` (not memoized — their own props
change on every relevant update anyway) always re-render, but they pass each `song` object
down by reference; `React.memo` on the row sees the same `song` reference, the same
primitive `isSelected`/`isDownloading`/`isPlaying` booleans, and the same function
identities, and skips re-rendering that row.

**Cross-cutting audio-stop triggers**, no edits to other workstreams' handler bodies:
- `SongTable.js` already receives `isSearching` as a prop; a `useEffect` keyed on
  `[currentPage, pageSize, filterText]` plus a second one on `isSearching` (guarded so it
  only fires on the false→true edge) calls `stop()` — covers page change, filter change,
  and "a new search started".
- `PlayerSections.js` receives `sections`; a `useEffect` keyed on `sections` that calls
  `stop()` whenever any `section.isLoading` is true covers a fresh player search/reload.
- Both components also `stop()` on unmount. Since the playlist view and the player view
  are mutually exclusive in `page.js` (`{playerProfile ? <PlayerSections/> : <SongTable/>}`
  pattern at the JSX read this session), only one of the two audio owners is ever mounted,
  so this is safe and requires no shared provider.

## Changes by file

**`src/lib/useAudioPreview.js`** (new) — as designed above.

**`src/lib/useStableCallback.js`** (new) — as designed above.

**`src/components/MatchNotice.js`** (new), **`StatusBadge.js`** (new), **`BeatmapCover.js`**
(new) — as designed above.

**`src/components/SongRow.js`** (full file owned):
- Wrap default export in `React.memo` (line 9).
- Remove `activeAudio`/`onToggleAudio` props; add `isPlaying`, `isPreviewLoading`,
  `isPreviewError`, `onTogglePreview` (booleans + one stable function, computed by the
  parent from `useAudioPreview()`).
- Lines 64-71 (mark) + 226-237 (notice): replace both with one
  `<MatchNotice artistOverride={match?.artistOverride} extractedArtist={song.extractedArtist} />`
  rendered once per its actual position — the mark stays in the checkbox cell, the notice
  stays in the Match cell, so `MatchNotice` exports two small named pieces (`OverrideMark`,
  `OverrideNotice`) built from one shared prop-check rather than one that must render in a
  single DOM spot; this preserves the current two-cell layout.
- Lines 85-95 (thumbnail `<img>`): add `loading="lazy" decoding="async" width={52}
  height={34}` (matching the existing container's inline pixel size).
- Lines 240-301 (cover + preview button): replace with `<BeatmapCover>`.
- Line 318-… (status badge span): replace with `<StatusBadge status={match.status} />`.

**`src/components/SongCardMobile.js`** (full file owned): identical set of changes at its
own line numbers — mark 69-76, notice 223-227, thumbnail img 86-96 (`width={42}
height={28}`), cover+preview 238-290, status badge span ~298-308.

**`src/components/SongTable.js`** (full file owned):
- Delete `activeAudio` state (line 29), `audioRef` (line 32), `handleToggleAudio` (35-54),
  the cleanup effect (56-62); replace with `const audio = useAudioPreview();`.
- Line 229 and 250 (`onOpenAltPicker={(s) => setAltPickerSong(s)}`): replace with
  `onOpenAltPicker={setAltPickerSong}` — `setAltPickerSong` is already a stable setter, the
  wrapping arrow function was the only unstable part.
- Lines 219-232 (`SongRow` map) and 240-253 (`SongCardMobile` map): pass
  `isPlaying={audio.isPlaying(song.id)}`, `isPreviewLoading={audio.isLoading(song.id)}`,
  `isPreviewError={audio.isError(song.id)}`, `onTogglePreview={audio.toggle}` instead of
  `activeAudio`/`onToggleAudio`.
- Lines 527-531 (alt-picker cover `<img>`): add `loading="lazy" decoding="async" width={64}
  height={42}`; line 538 (`handleToggleAudio(...)`) becomes `audio.toggle(...)`.
- Add the two `stop()`-triggering effects described above (new, near the top of the
  component, after the `audio` hook call).

**`src/components/PlayerSections.js`** (owned except lines ~370-400, matching-player's
`section.total` render inside the section-header button — left untouched):
- `BeatmapRow` (83-302): wrap in `React.memo` and give it its own name so it can be
  exported for the memo wrapper to work the same way as the other two rows (`const
  BeatmapRow = React.memo(function BeatmapRow(...) {...})`, still module-private, not a
  default export change — nothing outside this file references it).
- Remove the `activeAudio`/`onToggleAudio` props (87, prop list at 83); take
  `isPlaying`/`isPreviewLoading`/`isPreviewError`/`onTogglePreview` instead, same shape as
  the two other rows.
- Lines 123-130 (mark, no paired notice today — F-49): replace with
  `<MatchNotice.OverrideMark artistOverride={match.artistOverride} />` plus
  `<MatchNotice.OverrideNotice artistOverride={match.artistOverride}
  extractedArtist={song.extractedArtist} />` placed in the details column (191-…) next to
  the title — `song.extractedArtist` is not currently read here; it exists on the song
  object per the CLAUDE.md contract, so this is additive, not a new field.
- Lines 134-188 (cover + preview button): replace with `<BeatmapCover>`.
- Status badge span (~in the details block, 190-249): replace with `<StatusBadge>`.
- Lines 313-333 (`activeAudio` state, `audioRef`, `handleToggleAudio`, cleanup effect):
  delete; replace with `const audio = useAudioPreview();` at the top of the default
  export (304), plus the `sections`-keyed stop effect described above.
- Lines 492-502 (`BeatmapRow` prop wiring inside the `allItems.map`): pass the four
  `audio.*` values instead of `activeAudio`/`handleToggleAudio`.

**`src/components/PlayerResults.js`** (full file owned): line 58-69 (avatar `<img>`): add
`loading="lazy" decoding="async" width={40} height={40}`. Low-severity per F-20's own note
(20-per-page cap), included for consistency since it is in `client-ui`'s file list.

**`src/app/page.js`** — owned ranges only: `1-20` (imports, excluding line 21 `import
JSZip`), `76-124` (top state/hooks), `861-994` (excluding nothing there — this whole range
is owned), `1011-1106` (excluding 995-1010, the demo badge block).
- Line 1-7ish: add `import { useStableCallback } from '@/lib/useStableCallback';` (no other
  import changes — `useAudioPreview` is not imported here; it is only used inside
  `SongTable`/`PlayerSections`, not in `page.js` itself).
- Immediately before `return (` (currently line 888, after `matchedCount`/`searchedCount`/
  `unsearchedCount` at 882-886 — all inside the owned 861-994 range): add one
  `useStableCallback` call per handler that `page.js` hands to `SongTable`/`PlayerSections`
  and does not itself own: `handleToggleSelect`, `handleSelectAll`, `handleDeselectAll`,
  `handleDownloadSingle`, `handlePageChange`, `handlePageSizeChange`,
  `handleSearchAllRemaining`, `handleManualSearch`, `handleSelectMany`,
  `handleToggleSection`. (`handleSelectAlternativeMatch` and `handleClearList`, both owned
  by `client-ui` at 861-880, need no wrapper — they already close over nothing but the
  stable `setSongs`/`setPlaylistMeta`/etc. setters.)
- Lines 964-972 (`PlayerSections` prop wiring) and 1036-1053 (`SongTable` prop wiring):
  swap in the `stable*` names from the previous step. No prop is added or removed, no
  handler signature changes.

## Cross-workstream interfaces

- **Depends on** (does not enforce, only relies on): every `setSongs(prev => prev.map(...))`
  in `matching-player`'s and `downloads-cost`'s owned ranges keeps returning the identical
  `s` reference for untouched songs. Verified this session by grepping every `setSongs(`
  call site in `page.js` (16 call sites: `149,191,227,303,326,340,376,438,471,493,549,598,
  673,686,708,862,874`) — the per-song ones (`471,493,673,686,708,862`) all use the `s.id
  === target ? {...} : s` shape or an explicit `return s;` inside `.map`. The others
  (`149,191,227,303,326,340,376,438,549,598,874`) are whole-list replacements (new
  playlist, clear, mode/status filter, strictness re-narrow) where every row is expected to
  change or the list is emptied, so memo correctly re-renders everything there — not a
  regression, a real full-list change. If a future edit to those handlers switches to an
  unconditional `.map(s => ({...s}))`, memo still returns correct results, it just stops
  saving renders — a silent perf regression, not a correctness one, and outside this
  workstream's ranges to prevent.
- **Provides nothing new** to other workstreams — no new shared lib like `http.js` or
  `validate.js` is needed for this workstream's scope.
- **Boundary respected, not touched:** `PlayerSections.js:370-400` (matching-player's
  `section.total` display inside the section header button) — confirmed by reading
  335-360esque header code this session; the props/JSX this plan changes in the same file
  (83-333, 469-506) do not overlap that range.
- **Song-shape addition used, not introduced:** `song.extractedArtist` is read by the new
  `BeatmapRow` notice (currently unread in that file) but is already part of the song
  contract per `CLAUDE.md` and already populated by `matching-player`'s code — no schema
  change.

## Implementation order

1. Add `useStableCallback.js` and `useAudioPreview.js` — new files, zero consumers, `npm
   run lint` must stay clean.
2. Add `MatchNotice.js`, `StatusBadge.js`, `BeatmapCover.js` — new files, zero consumers.
3. Wire `useAudioPreview` into `SongTable.js` (replace local audio state) and into its
   `SongRow`/`SongCardMobile` prop wiring; delete `SongTable`'s old `handleToggleAudio`.
   Verify: play a preview, confirm it stops on page change / filter change / new search.
4. Wire the same hook into `PlayerSections.js`/`BeatmapRow`; delete its old
   `handleToggleAudio`. Verify: start a preview in the playlist view is impossible to
   observe simultaneously with one in the player view (they're mutually exclusive
   mounts, but confirms the singleton didn't leak state across a view switch).
5. Add `React.memo` to `SongRow`, `SongCardMobile`, `BeatmapRow`; add the
   `useStableCallback` calls in `page.js` and swap them into the two prop-wiring blocks.
   Verify with the React DevTools Profiler: search a 20+ track list, confirm only the
   completing row commits per completion.
6. Swap in `MatchNotice`, `StatusBadge`, `BeatmapCover` at all four call sites (`SongRow`,
   `SongCardMobile`, `BeatmapRow`, alt-picker), add `loading="lazy" decoding="async"` +
   explicit width/height to every remaining bare `<img>` (thumbnails, `PlayerResults`
   avatars). Verify: Network tab shows lazy loading, only one tree's images fetch at a
   given viewport width.
7. Phone-width and desktop screenshots (screenshot-app skill, 375px and ≥769px) of: the
   song table with a few matched/unmatched/override rows, an open player section, and the
   alt-match picker open — confirm no horizontal scroll and that D-15/UI-08 (globals.css
   `.osu-table-desktop`/`.osu-table-mobile` switch, lines ~250-268) still holds after all
   four workstreams' changes are merged.

Each step is independently revertible and independently lint-clean; step 3 and 4 can land
as one commit if preferred since they touch disjoint files.

## Risks

- **Memo silently stops updating a row.** If any future prop passed to a row becomes a
  freshly-allocated object/array each render (e.g. someone re-adds an inline arrow function
  as a prop), `React.memo`'s default shallow compare sees a "change" and re-renders anyway
  — safe but slow, not a correctness bug. The one prop that *could* break correctness is
  `song` itself; mitigated by the cross-workstream dependency noted above, checked via the
  Profiler step (5) rather than a custom comparator (kept simple per the "no
  per-item special-casing" rule — a custom comparator would itself be a special case to
  maintain).
- **`loading="lazy"` on a `display:none` ancestor.** Modern Chromium/Firefox never fetch a
  lazy image with no layout box; when the media query flips its container to visible, the
  IntersectionObserver re-evaluates and the fetch fires then — this is the exact mechanism
  D-08's fixDirection relies on. Older Safari has had inconsistent behavior here; worst
  case on an affected browser is a return to today's behavior (both trees fetch), not a
  regression below today's baseline. Flagged as a browser-check item in Verification, not
  assumed.
- **Explicit `width`/`height` attributes fighting the existing `style={{width:'100%',
  height:'100%'}}` container-fill pattern.** All four cover/thumbnail containers already
  size themselves in pixels via an inline-styled wrapper `div`; the `<img>`'s own
  `width`/`height` HTML attributes are used by browsers only to reserve aspect-ratio space
  before CSS is applied, and are overridden by the `100%` style once it loads — verified
  by reading the wrapper markup at each of the four sites this session (all fixed pixel
  wrapper sizes, no `auto`), so this is additive safety, not a behavior change.
- **`PlayerSections.js`'s 370-400 boundary.** Since `BeatmapRow` (83-302) and the list map
  (469-506) are both outside that range but in the same file, a careless multi-hunk diff
  could drift into it. Mitigated by doing the `PlayerSections.js` edit as one diff reviewed
  against the exact boundary lines quoted above before committing.
- **Shared audio singleton outliving a route change entirely (SPA navigation away from
  `/`).** Not reachable today — this is a single-route app (`src/app/page.js` is the only
  page); noted only so a future multi-route change knows to add a stop-on-route-change
  effect.

## Verification

- `npm run lint` after every step.
- React DevTools Profiler: load ~20-30 tracks, let searches complete one by one, confirm
  each completion's commit touches exactly one row (plus the summary bar) — this is the
  workstream's own stated verification method in `2-findings.md`'s client-ui section, no
  bench run is listed there and none is needed: `client-ui` makes no change to
  `scoreBeatmapMatch` or anything `bench/` exercises (`bench/scorers/shipped.mjs` imports
  only `src/lib/osu.js`, untouched by this plan).
- Network tab: with the browser at ≥769px width, confirm only `.osu-table-desktop`'s
  images request; resize to ≤768px, confirm only `.osu-table-mobile`'s request from that
  point on (each cover fetched once per breakpoint, not twice).
- Manual: play a preview, change page/apply a filter/start a new search/switch player
  profile — confirm it stops each time; break a `previewUrl` (e.g. via the alt-picker on a
  set with no preview) and confirm a visible, dash-free error string (e.g. "Preview
  unavailable" — never "Preview failed - try again").
- Manual: trigger an `artistOverride` result in the player-search path (currently
  unreachable per the F-49 note, so this may only be checkable by feeding `BeatmapRow` a
  synthetic prop in isolation, e.g. via a temporary Storybook-less manual prop patch in a
  scratch file, not committed) — confirm the mark and its notice always appear together.
- screenshot-app skill at 375px and desktop width: song table (mixed matched/unmatched/
  override rows), an open player section, the alt-match picker — confirm no horizontal
  scroll, re-confirming D-15/UI-08 after all four workstreams merge.
- No live `/api/osu/*` calls are needed for any of the above — every check runs against
  data already in the running dev server's client state or against static/demo content.

## Cost impact

- osu! API calls: zero change — this workstream edits no route handler and no server code.
- Vercel function invocations / edge middleware: zero change, same reason.
- Origin transfer: net decrease — fewer eager image fetches on initial load (lazy-loading
  defers off-screen covers), and the hidden desktop/mobile tree's images stop fetching at
  all. All of this bandwidth goes to the osu! CDN (`assets.ppy.sh`) or the extractor's own
  thumbnail host, not through a Vercel function, so it was never billed to us either way
  (per F-20's own evidence) — the improvement is user-experienced load time, not cost.
- Bundle size: five new small files (`useAudioPreview.js`, `useStableCallback.js`,
  `MatchNotice.js`, `StatusBadge.js`, `BeatmapCover.js`), each under ~60 lines, no new npm
  dependency — negligible, well under 1KB gzipped combined.
