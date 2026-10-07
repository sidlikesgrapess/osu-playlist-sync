# DESIGN.md

The design system of osu!Sync as it exists in the code, written so that new UI **reuses** what is
here instead of writing a near copy of it. Before the rebuild, container animations, modal shells
and row logic were written again and again in slightly different forms, and they drifted apart.
This file exists to stop that happening a second time.

Every entry names the canonical piece with `file:line`. Line numbers are as of commit `741c27d`;
when one has moved, search for the name, which is stable.

**The one rule:** before you write a style object, animation, scroll listener, button, badge,
modal or row helper, find it in this file. If it is here, use it. If it is close, extend it. If it
is listed under [Known duplicates](#9-known-duplicates-the-debt-register), do not add another copy:
consolidate first or leave a note in `todo`. If it is genuinely new, add it to this file in the
same change.

Contents

1. [Hard rules (the traps)](#1-hard-rules-the-traps)
2. [Tokens](#2-tokens)
3. [Motion](#3-motion)
4. [Physics and scroll driven motion](#4-physics-and-scroll-driven-motion)
5. [Layout, docking and sticky](#5-layout-docking-and-sticky)
6. [Components and CSS classes to reuse](#6-components-and-css-classes-to-reuse)
7. [Logic helpers to reuse](#7-logic-helpers-to-reuse)
8. [Row anatomy](#8-row-anatomy)
9. [Known duplicates (the debt register)](#9-known-duplicates-the-debt-register)
10. [Checklist before you add UI](#10-checklist-before-you-add-ui)

---

## 1. Hard rules (the traps)

These are the mistakes the audit found actually shipped. Each one cost a feature silently.

1. **`!important` classes beat inline styles.** `.osu-glass` (`globals.css:51`),
   `.osu-glass-card` (`:57`) and `.osu-table-row` (`:111`) set `background`, `border` and
   `box-shadow` (the row: `background` and `transition`) with `!important`. `.osu-btn-pink`
   (`:79`) does the same for background, colour, border and shadow. **Any inline value for those
   properties on an element carrying the class never renders.** This is why:
   - a selected song row has no highlight on desktop (`SongRow.js:50`) or mobile
     (`SongCardMobile.js:52-55`);
   - all four modal panels render `.osu-glass` values, not their inline ones;
   - the StatsBar "Search All" pink outline (`StatsBar.js:147-148`) never shows, while the same
     button in `SongTable.js:293` does;
   - `.osu-btn-interactive`'s `!important` transition overrides every inline transition on the
     same element (`OsuCheckbox.js:50` only applies while disabled).

   To vary a state on one of these elements, add a **modifier class** in `globals.css`
   (e.g. `.osu-table-row.is-selected`), or drop the utility class. Never add another inline
   override.
2. **Decide mobile vs desktop in CSS only.** Breakpoints live in `globals.css` (480, 640,
   768/769). There is no JS width hook and there must not be one. A desktop/mobile pair is
   switched with `.osu-table-desktop` / `.osu-table-mobile` (`globals.css:240-269`).
3. **Never measure the navbar or the search bar yourself.** Anything that sticks under the bar
   reads `var(--player-dock-top, 56px)`. Script that needs the number uses `parseDockTop`
   (`stickySections.js:38`). Never write a `scrollY > N` threshold for "is docked".
4. **Never add another window scroll listener.** There are already three (four instances). Use
   `useScrollOffset` (section 4) or extend it.
5. **Gate every new transition on reduced motion.** Use `usePrefersReducedMotion`
   (`PlayerSections.js:39`) plus a CSS backstop class like `.ps-anim` (`globals.css:274-278`).
   The hook is file local today: move it to `src/lib/` before a second consumer, don't copy it.
6. **Only the four z-index tiers below.** Do not invent a new number.
7. **Colours come from the token table.** If a value is not in section 2, you are about to add a
   near duplicate. Pick the canonical one.
8. **User-facing copy never uses a dash as punctuation** (CLAUDE.md).

---

## 2. Tokens

There is no token file yet; tokens are literals. These are the **canonical** values (most used,
and the ones to standardise on). The "do not use" column lists the near duplicates already in the
code for the same role; don't add more uses of them.

### Colour

| Role | Use | Do not use (near duplicates) |
|---|---|---|
| Brand pink, primary accent | `#ff66aa` | |
| Pink hover / active (buttons) | `#ff7bbb` / `#eb5597` (via `.osu-btn-pink`) | |
| Pink outline border | `rgba(255,102,170,.35)` | `.3`, `.32`, `.4`, `.55`, `.28` |
| Pink tint background | `rgba(255,102,170,.15)` (badges), `.1` (selected card) | `.08`, `.18` |
| Page body | `#141318` (`globals.css:32`) | `#201f27` on body in `layout.js:14` is dead |
| Panel (`.osu-glass`) | `#1e1c26` | `#1c1a25` (PlayerProfile, SongTable pager) |
| Raised card (`.osu-glass-card`) | `#252230` | `#252130`, `#201d29` |
| Table row / hover | `#211e2b` / `#2c2838` (`.osu-table-row`) | |
| Modal header / footer band | `#171520` | `#18171c` (ExportModal footer) |
| Text field well | `#18171c` | |
| Dark chip button | `#262232` | |
| Thumbnail / icon button placeholder | `#343040` | |
| Hairline border / divider | `rgba(255,255,255,.08)` | `.05`, `.06`, `.07`, `.1`, `.12`, `.14`, `.15` |
| Primary text | `#ffffff` | `#e4dced`, `#e8e2ee` |
| Secondary text | `#c6b8ce` | `#c0b4c8` |
| Muted label | `#887c93` | `#8b7d95` (both appear inside StatsBar for identical labels) |
| Success | `#00cc77` | `#00dd88` |
| Loading / warning | `#ffbb22` | `#ffcc22` (song row spinners) |
| Error text / tint | `#ff8888` / `rgba(255,68,68,.12)` bg, `.3` border | `#ff4444`, `#ff5555`, `#ff3d5e` |
| Info blue / link blue | `#3399ff` / `#44bbee` | |
| Modal backdrop | `rgba(0,0,0,.75)` | |
| Platform: Spotify / Apple | `#1db954` / `#fc3c44` | |
| Platform: YouTube | pick one; today `#ff0000` (Icons), `#ff3333` (PlaylistInput), `#ff4444` (page.js) | |

Colours with a meaning come from `src/lib/beatmapFormat.js`, never inline:
`getStarColor(stars)`, `getStatusBadgeStyle(status)`. Platform badge colours are `PLATFORM_BADGE`
(`page.js:97`); move it to `beatmapFormat.js` before a second consumer needs it.

### Typography

- Fonts are loaded by `@import` in `globals.css:1`: **Nunito** (body, 400 to 900) and
  **JetBrains Mono**. Monospace text uses the `.mono-font` class (`globals.css:45`), never an
  inline `fontFamily` (four star badges currently inline it).
- Root size is 15px, 14px at ≤640px (`globals.css:17,26`), so everything is in `rem`.
- Weights: 800 is the default for UI text, 900 for titles and stat values, 700 for body/meta,
  600 for meta lines.

| Role | Size / weight |
|---|---|
| Page / modal title | `1rem`–`1.05rem` / 900 |
| Section header | `0.92rem` / 900 |
| Stat value | `1.15rem` / 900 |
| Beatmap title | `0.84rem` / 800 (mobile `0.8rem`) |
| Meta line (mapper, BPM) | `0.72rem` / 600, `#c6b8ce` |
| Button | `0.72rem`–`0.82rem` / 800 |
| Uppercase label | `0.66rem` / 800, muted, uppercase |
| Badge / tag | `0.62rem`–`0.72rem` / 800, uppercase for status |

### Radius, shadow, border, spacing

| Token | Value | Used for |
|---|---|---|
| Panel radius | `10px` (`CARD_RADIUS`, `PlayerSections.js:36`) | panels, modals, toast, mobile card |
| Inner radius | `9px` (`INNER_RADIUS`) | a full bleed child inside a 1px bordered card |
| Inner card radius | `8px` | list items, search bar, error banner |
| Button radius | `6px` | buttons (some row buttons use 5px; prefer 6) |
| Small / badge radius | `4px` tags and thumbs, `3px` status and star badges | |
| Panel shadow | `0 4px 20px rgba(0,0,0,.35)` (`.osu-glass`) | |
| Card shadow | `0 2px 8px rgba(0,0,0,.2)` (`.osu-glass-card`) | |
| Lifted / docked shadow | `0 12px 32px rgba(0,0,0,.55–.6)` | docked search bar, toast |
| Border | always `1px solid`, hairline or pink outline | |
| Gaps | 4, 6, 8, 10 px | 6 and 8 are the common ones |

### Width and gutter

- Content column: `maxWidth: '1240px', margin: '0 auto <gap>'`, inside `<main>`'s 16px gutter
  (`page.js:1322`). It is written 13 times with no constant. **Add a shared constant before writing
  the fourteenth.**
- Modals: 420 to 700 wide, `width: 100%`, backdrop padding 12px.
- Hero: 960 / 880.

### z-index (the whole stack)

| z | What | Rule |
|---|---|---|
| 1 | `.osu-table-row` | |
| 30 | sticky player section header | anything stuck **under** the dock |
| 45 | search bar dock `.pi-dock` | |
| 60 | navbar | |
| 100 | every modal backdrop | all overlays |
| 200 | `DownloadToast` stack | all toasts |
| 99999 | `HitCircleEaster` burst | easter egg only |

---

## 3. Motion

### House timing

There are exactly three motion families. A new transition uses one of them.

| Family | Value | Use for |
|---|---|---|
| **Feedback** | `0.15s ease` | hover / press on controls (transform, background, border, colour) |
| **Surface** | `0.12s ease` | row and surface colour changes (background-color, border-color) |
| **Structural** | `DOCK_EASE` = `cubic-bezier(0.16, 1, 0.3, 1)`, 0.28s to 0.3s (`BODY_MS = 300`) | docking, collapse/expand, chevrons, anything that moves layout |

`DOCK_EASE` and `BODY_MS` live in `PlayerSections.js:27-28`, but `PlaylistInput.js` writes the
same curve as a literal three times (`:207`, `:217`, `:520`). **Move both constants to
`src/lib/stickySections.js` (or a `motion.js`) and import them; never type the curve again.**

Others in use: thumbnail zoom `0.2s ease`; scroll-follow smoothing `0.05s linear` (Hero, Navbar);
toast slide `420ms cubic-bezier(0.22,1,0.36,1)` (close enough to `DOCK_EASE` that a new use should
pick `DOCK_EASE`).

### Keyframes and animation classes (`globals.css`)

| Class / keyframe | What | Use when |
|---|---|---|
| `.spin-slow` (`spinSlow`, 3s linear) | rotate | **every** spinner: `<Loader2 className="spin-slow" />` |
| `.osu-wave-bar` (`waveAnim`, 0.6s, staggered children) | "playing" bars | audio playing indicator; comes free with `BeatmapCover` |
| `osu-simple-ripple`, `osu-simple-judgment` | hit ring and "300" | only `HitCircleEaster` |

Modals have **no** open or close animation. If you add one, add it to the shared modal shell
(section 6), not to one modal.

### Interaction classes

| Class | Effect | Use when |
|---|---|---|
| `.osu-btn-interactive` (`globals.css:64`) | lift 1px on hover, press 1px on active, 0.15s | every clickable button or link. Do not add an inline `transition` to the same element. |
| `.osu-pill-tab` (`:96`) | same as above but no press | segmented pills only (identical to the above except `:active`; merge candidate) |
| `.osu-btn-pink` (`:79`) | primary pink look | the one primary action in a region; always with `.osu-btn-interactive` |
| `.osu-table-row` (`:111`) | row bg, hover bg, thumb zoom 1.04, title colour, `.osu-play-btn` scale 1.1 | desktop table rows |
| `.osu-thumb-container` (`:155`) | img zooms 1.06 on hover | any clipped thumbnail that zooms itself |

Known cascade gaps: the `!important` transition list omits `box-shadow`, so the pink button's
hover shadow snaps; `.osu-play-btn` only works inside `.osu-table-row` (on the mobile card it does
nothing).

### Enter / exit patterns

| Pattern | Canonical | Use when |
|---|---|---|
| Collapse / expand of unknown height | `SectionBody` (`PlayerSections.js:61-112`): `grid-template-rows` 0fr↔1fr, double rAF before expanding, unmount on `transitionend` with a fallback timeout (`UNMOUNT_FALLBACK_MS = 450`) | any collapsible region. Extract it to its own component before a second use; do not write a height-measuring version. |
| Slide in, auto dismiss | `DownloadToast` (`DownloadToast.js`): one rAF then `entered`, slide out then unmount by timeout | transient notices. Add to the toast system (`TOAST_KINDS`), don't build another. |
| Instant jump before a shrink | `collapseScrollTarget` + `scrollTo({behavior: 'auto'})` (`PlayerSections.js:443-456`) | removing or collapsing content above the viewport. Do not use a smooth scroll here (reason at `stickySections.js:59-63`). |

### Reduced motion

Handled only in PlayerSections (`usePrefersReducedMotion` + `.ps-anim`). **Missing** on the search
bar dock, the toast, the hit circle, the wave bars, the button lifts, thumbnail zooms, the Hero
and Navbar scroll transforms and the scroll to top. New motion must be gated; fixing the missing
ones is open work.

---

## 4. Physics and scroll driven motion

### `useScrollOffset(max)` (`src/lib/useScrollOffset.js`)

Passive window scroll listener, rAF throttled, returns `min(max, scrollY)` and stops re-rendering
once past `max`. No resize handling. **Use this for any value that interpolates with scroll near
the top of the page.** Consumers:

- **Hero** (`Hero.js:12`, max 150): `progress = clamp(scrollY / 130)`; opacity `1 - 1.3p`,
  `translateY(-0.5 * scrollY)`, `scale(1 - 0.22p)`.
- **Navbar** (`Navbar.js:16`, max 140): brand fades in from 15px to 120px with a 14px rise;
  above `p > 0.05` the bar gets its scrolled background.

Both write the same style fragment (`willChange: 'transform, opacity'` +
`transition: 'transform 0.05s linear, opacity 0.05s linear'`); share it rather than writing a
third.

The other two scroll listeners are the ones to fold in, not copy:
`PlaylistInput.js:93-111` (`isDocked = scrollY > 180`, which is `useScrollOffset(181) > 180`) and
`PlayerSections.js:407-430` (geometric docked check).

### DownloadToast drag and fling (`DownloadToast.js:73-161`)

The only real physics in the app. A rAF loop writes `transform` and `opacity` directly while
`physicsOn` turns the CSS transition off.

- Drag: exponential follow `pos += (target - pos) * FOLLOW (0.22)`; velocity is an EMA
  (`VEL_SMOOTHING 0.35`).
- Release: velocity `* RELEASE_BOOST 1.25`, clamped to `MAX_RELEASE_SPEED 26`, then `fall`.
- Fall: `vy = min(vy + GRAVITY 0.8, TERMINAL_VY 30)`, `vx *= AIR_DRAG 0.995`, opacity
  `-= FADE_PER_FRAME 0.035`; dismissed at 0 opacity or offscreen.
- All constants are **per frame**, so it runs faster on 120/144 Hz screens. If you reuse it, scale
  by rAF delta time.

Use it only for a draggable, throwable card. Nothing in the app springs or bounces.

### HitCircleEaster (`HitCircleEaster.js`)

Not physics: a ref with `triggerHit(e)` appends a ring + "300" (at most 4 live), portalled at
z 99999, each removed after 600ms. Used by the Hero logo and the Navbar brand. Reuse the component
for any one-shot burst; do not write another.

---

## 5. Layout, docking and sticky

### The dock line

- The search bar (`PlaylistInput.js:201-218`) is `position: sticky; top: 56px; z-index: 45`.
- It publishes **`--player-dock-top`** on `<html>` (`PlaylistInput.js:117-134`): its sticky top
  plus its measured height minus `DOCK_OVERLAP` (1px), via `dockTopFrom`
  (`stickySections.js:30`). It re-measures on a ResizeObserver and on resize.
- `DEFAULT_DOCK_TOP = 56` (`stickySections.js:13`) is the navbar line. Use the constant; the
  literal 56 is currently also hardcoded at `PlaylistInput.js:205` and in the CSS fallback.

### Sticky headers that push each other out (VS Code style)

There is **no push-out function**; it is native sticky containment. Copy this recipe:

1. The header is `position: sticky; top: var(--player-dock-top, 56px); z-index: 30` inside its own
   card (`PlayerSections.js:496-520`).
2. The card has **no `overflow`** (with it, the card becomes the scroll container and stickiness
   breaks; `PlayerSections.js:33-37`). Round corners on the header and background instead.
3. The card's bottom edge carries the header away when the next card arrives.
4. Closed sections use `position: static`.

The docked look (shadow, `0 0 9 9` radius) comes from `isHeaderDocked({cardTop, dockTop})`
(`stickySections.js:48`), and the bar's squared bottom comes from setting
`data-player-section-docked` on `<html>` (`SECTION_DOCKED_ATTR`, `stickySections.js:27`), keyed in
`globals.css:282-286`. **To change how the bar looks when something docks under it, use that
attribute. Do not pass props between PlaylistInput and PlayerSections.**

### Responsive

| Query | Effect |
|---|---|
| `max-width: 480px` | compact search bar, hides mode icon and submit label |
| `max-width: 640px` | root font 15 → 14px |
| `max-width: 768px` / `min-width: 769px` | `.osu-table-mobile` / `.osu-table-desktop` swap |

Fluid sizing uses `clamp()` (Hero, StatsBar), `repeat(auto-fill, minmax(240px, 1fr))`
(PlayerResults) and `flexWrap: 'wrap'`. Note that SongTable mounts **both** the desktop table and
the mobile cards; CSS hides one (`SongTable.js:186`, `:244`).

---

## 6. Components and CSS classes to reuse

| Need | Use | Notes |
|---|---|---|
| Top level panel | `className="osu-glass"` + radius 10 | never inline bg/border/shadow on it |
| Raised card / secondary button | `className="osu-glass-card"` | same rule |
| Primary button | `osu-btn-interactive osu-btn-pink` + inline sizing only | don't repeat `border: 'none'` (the global button reset already does) |
| Any other button | `osu-btn-interactive` + one of the recipes below | |
| Segmented pills | `pillStyle()` (`PlaylistInput.js:42`) + `osu-pill-tab` | file local; promote before reuse |
| Checkbox | `OsuCheckbox` (`components/OsuCheckbox.js`) | it plays its own click and ignores clicks when `disabled`; don't guard or click again in `onChange` |
| Beatmap cover + preview play | `BeatmapCover` (`components/BeatmapCover.js`) | the only place that registers with the preview stop rule; pass `key={coverUrl}` |
| Flagged match | `OverrideMark` + `OverrideNotice` (`components/MatchNotice.js`) | always as a pair |
| Toast | `DownloadToast` (`TOAST_KINDS`) | add a kind, not a component |
| Must acknowledge notice | `TruncationDialog` pattern | on the shared modal shell once it exists |
| Spinner | lucide `Loader2` + `.spin-slow` | colour `#ffbb22` for loading |
| Platform logo | `components/Icons.js` | |
| Status badge colours | `getStatusBadgeStyle` | there is no `<StatusBadge>` yet (4 inline copies) |
| Star colour | `getStarColor` | there is no star range formatter yet (4 formats) |
| Counts | `formatCompactNumber` | |
| Beatmapset link | `beatmapsetPage(id)` (`lib/mirrors.js:54`) | four places hardcode the URL instead |

Missing shared pieces (every one exists as 3 or 4 inline copies; see section 9). **The next person
who needs one of these builds the shared version and migrates the copies:** modal shell (backdrop,
panel, header, close X, footer), status badge, star badge with one range format, dark chip button,
pager prev/next, "view on osu!" icon link, download `.OSZ` button, "Preview unavailable" line,
error banner, uppercase metric label, source thumbnail with fallback, tinted tag pill.

Recipes in use for those buttons today (match them exactly until the shared version exists):

- **Dark chip**: bg `#262232`, border hairline, colour `#c0b4c8`, radius 5
  (`PlayerResults.js:110`).
- **Pink outline**: bg `#2c2234`, border pink `.35`, colour `#ff66aa` (`SongTable.js:293`).
- **Icon button**: bg `#343040`, radius 5, 28px square (`SongRow.js:415-435`).

---

## 7. Logic helpers to reuse

| Need | Use | Where |
|---|---|---|
| Build a song object | `makeSong` | `lib/song.js` |
| Add songs to a list | `mergeSongs` / `songKey` | `lib/song.js` (page.js has a second `mergeSongs`; don't use it for new code) |
| Line under a song title | `songSubtitle(song)` | `lib/song.js` |
| Player collection → rows | `visibleItemsFor` (filter, then dedupe) / `beatmapToSong` | `lib/collection.js` |
| Anything that ticks a row without a click | `isAutoSelectable` / `confirmedMatchIds` | `lib/beatmapFormat.js` |
| "No match" copy | `describeRejection` → `{message, hint}`; render `hint` in `<em>` | `lib/beatmapFormat.js` |
| Selection across both sides | `selectedBeatmapEntries`, `matchedBeatmapUnion`, `soleOwnerSides`, `zipBaseTitle` | `lib/selection.js` |
| Audio preview for a list | `useAudioPreview()` once in the list owner; pass booleans + `toggle` down | `lib/useAudioPreview.js` |
| UI sounds | `osuAudio.playHover / playClick / playSuccess` | `lib/soundEffects.js` |
| Stable callback into a `memo` row | `useStableCallback` | `lib/useStableCallback.js` |
| Call `/api/osu/search` | `pacedSearch` → `pacedRequest`, with `shouldSkip` tied to `songListGenerationRef` | `page.js:84`, `lib/searchPacer.js` |
| One archive download (single or batch) | `handleDownloadSingle(song, {silent, budget, pacer, signal})` | `page.js:1045` |
| Long, cancellable multi item action | `beginBatch` / `endBatch` / `cancelBatchHolding` | `page.js:988-1020` |
| Reset / fail a row's match state | `blankMatchState` / `failedSearchState` / `markSearchFailed` | `page.js:63-70, 702` |
| Truncated playlist copy | `truncationMessage` | `lib/truncationNotice.js` |
| Dock geometry | `dockTopFrom`, `parseDockTop`, `isHeaderDocked`, `collapseScrollTarget` | `lib/stickySections.js` |

State ownership: `page.js` owns songs, player songs, both selection sets, downloads and filters,
and is the only place the song object mutates. Components call back up; rows never fetch.

---

## 8. Row anatomy

A song row has the same pieces on three surfaces. When a row changes, it must change in **all**
of them, which is the strongest reason to extract shared pieces.

| Piece | Desktop `SongRow` | Mobile `SongCardMobile` | Player `BeatmapRow` (PlayerSections) |
|---|---|---|---|
| Checkbox + "!" flag | 56-71 | 61-76 | 217-228 |
| Source thumbnail | 82-111 | 83-112 | none |
| Title / subtitle | 113-127 | 115-129 | none |
| Query tag + inline edit | 129-215 | 133-216 | none |
| Match state ladder (searching, match, error, unsearched, rejection) | 222-408 | 219-366 | always matched |
| Cover + preview | 239-258 | 242-264 | 231-255 |
| Beatmap details (artist, title, status, mapper, BPM, stars) | 261-313 | 267-301 | 265-322 |
| Versions link | 316-341 | 371-395 | none |
| osu! link + download | 415-470 | 398-455 | 329-371 |

The alt version picker (`SongTable.js:436-666`) is a fourth place that renders status and star
badges.

---

## 9. Known duplicates (the debt register)

Confirmed by reading both sites. **Do not add a further copy of anything here.** The cleanup is
the "Remove redundant code" item in `todo`; it starts with the user picking what goes.

### Motion and layout
- `DOCK_EASE` constant vs three literals in `PlaylistInput.js` (section 3).
- Three scroll listeners: `useScrollOffset`, `PlaylistInput.js:93-111`, `PlayerSections.js:407-430`.
- Two "docked" tests: `scrollY > 180` (bar) vs `isHeaderDocked` (headers).
- Navbar line 56 written three ways (`DEFAULT_DOCK_TOP`, `PlaylistInput.js:205`, CSS fallback).
- `.osu-btn-interactive` vs `.osu-pill-tab` (differ only in `:active`).
- Image zoom in CSS (`.osu-thumb-container`) and again as `BeatmapCover`'s `hoverScale` prop.
- Row hover background in CSS (`.osu-table-row`) and again as `isHovered` state in BeatmapRow.
- Enter after paint: one rAF (toast) vs double rAF (SectionBody); exit: timeout vs
  `transitionend` + fallback.
- Hero/Navbar scroll-follow style fragment; the `isDocked` row block at `PlaylistInput.js:228` and
  `:282`.

### Components
- Modal shell ×4: `ExportModal.js:49-71`, `SetupGuideModal.js:60-82`, `TruncationDialog.js:21-43`,
  `SongTable.js:437-459` (plus 3 headers, 3 close buttons, 2 footers in different colours).
- Status badge ×4, star badge ×4 with three text formats (`min - max`, `min-max`, collapsed at 1 or
  2 decimals).
- Dark chip button ×6, pager prev/next ×2, Retry/Search mini button ×4, "view on osu!" link ×3,
  download button ×3, "Preview unavailable" ×3, error banner ×2, loading line ×3.
- Preview toggle wrapper `() => { osuAudio.playClick(); return toggle(url); }` ×4.
- 1240px content column ×13 with no constant.

### Logic
- `SongRow.js` vs `SongCardMobile.js`: props, local state and `handleQuerySubmit` are identical
  (lines 15-43 in both); checkbox block, thumbnail, query edit and actions are the same logic in
  different markup; the match ladder has diverged copy ("Finding" vs "Searching", "Try different
  keywords" vs "Edit keywords").
- `page.js`: the search result is applied twice (`:650-671` batch, `:905-923` manual); "search the
  unsearched rows on this page" ×3 (`:574`, `:717`, `:729`); a second `mergeSongs` (`:357`);
  player lookup error handling ×2 (`:269/340`, `:292/349`).
- Pagination is computed twice and they disagree (see bugs).

### Bugs found by this audit (open)
- Selected row / card highlight never renders (rule 1).
- Every row checkbox plays its click twice (`OsuCheckbox.js:19` and the row `onChange`).
- With the table filter in use, page.js's lazy search pages through the **unfiltered** list
  (`page.js:717` vs `SongTable.js:66-84`), so it searches rows that are not on screen.
- BeatmapRow's `memo` is defeated: PlayerSections passes page.js callbacks raw
  (`PlayerSections.js:691-692`); wrap them with `useStableCallback` as SongTable does.
- Toast physics constants are per frame (faster on high refresh screens).
- `HitCircleEaster.js:70`'s vertical centring is overridden by the keyframe from frame 0.

---

## 10. Checklist before you add UI

1. Is there a component, class or helper for this in sections 6 and 7? Use it.
2. Is it in section 9? Consolidate the copies first (with the user's go ahead), or reuse one
   copy exactly. Never add another.
3. Colours, radii, shadows, font sizes from section 2 only.
4. Motion uses one of the three families in section 3, with `DOCK_EASE` imported, not typed, and
   gated on reduced motion.
5. No new scroll listener, no `scrollY` threshold, no JS width check, no new z-index tier.
6. No inline background, border or shadow on an element with an `!important` utility class.
7. A row change lands in desktop, mobile and the player row (section 8).
8. If you created a genuinely new shared piece, add it to this file in the same commit.
