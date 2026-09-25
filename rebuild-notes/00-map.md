# osu!Sync rebuild map (Phase 0)

## Areas

## Area: extraction
```
src/app/api/playlist/route.js
src/lib/extractors.js
src/lib/titleCleaner.js
src/lib/youtube.js
src/app/page.js:334-407 (handleFetchPlaylist, searchTargetSongs fan-out entry)
src/app/page.js:125-182 (handleSubmitInput, handlePlayerSearch)
src/components/PlaylistInput.js
```

## Area: matching-api
```
src/app/api/osu/search/route.js
src/lib/osu.js:14-123 (getOsuAccessToken, token cache, osuApiGet helpers, isDemo)
src/lib/osu.js:419-670 (artistVerdict, scoreBeatmapMatch, aliasesFromSets, probeOsuArtist, resolveArtistTrust)
src/lib/osu.js:671-907 (searchOsuBeatmaps, downloadUrl construction at 905)
src/lib/matchStrictness.js
src/app/page.js:408-513 (searchTargetSongs, handlePageChange context)
src/app/page.js:536-672 (handleSearchAllRemaining, handleModeChange, handleStatusFilterChange, handleMatchThresholdChange, handleStrictnessRefetch, handleManualSearch)
src/lib/beatmapFormat.js:74 (describeRejection)
```

## Area: player
```
src/app/api/osu/player/route.js
src/app/api/osu/player/beatmaps/route.js
src/lib/osu.js:88-263 (parseOsuProfileRef, searchOsuUsers, getOsuUser)
src/lib/osu.js:264-418 (getUserBeatmapCollection, matchesCollectionFilters)
src/app/page.js:26-76 (createEmptySections, beatmapToSong, pageSlice, blankMatchState)
src/app/page.js:141-333 (handlePlayerSearch, handlePlayerResultsPageChange, handleSelectPlayer, loadSection, handleSelectMany, handleToggleSection, handleClearPlayer)
src/components/PlayerProfile.js
src/components/PlayerResults.js
src/components/PlayerSections.js
```

## Area: downloads
```
src/app/api/download/route.js
src/lib/beatmapDownload.js
src/app/page.js:65-76 (downloadBlob)
src/app/page.js:742-873 (handleDownloadSingle, handleDownloadBatch, handleDownloadZipBatch, handleSelectAlternativeMatch, handleClearList)
src/components/DownloadToast.js
src/components/ExportModal.js
src/lib/osu.js:905 (downloadUrl field build) and its consumers (grep osu.js:downloadUrl callers)
```

## Area: client-ui
```
src/app/page.js:1-124 (imports, state, effects)
src/app/page.js:880-1106 (JSX)
src/components/SongTable.js
src/components/SongRow.js
src/components/SongCardMobile.js
src/lib/soundEffects.js
src/components/StatsBar.js
src/components/Navbar.js
src/components/Hero.js
src/components/HitCircleEaster.js
src/components/ExportModal.js
src/components/SetupGuideModal.js
src/components/OsuCheckbox.js
src/lib/useScrollOffset.js
src/app/globals.css
src/components/Icons.js
```

## Area: platform-security
```
next.config.mjs
package.json
src/app/api/download/route.js
src/app/api/playlist/route.js
src/app/api/status/route.js
src/app/api/github/commits/route.js
src/app/api/osu/player/route.js
src/app/api/osu/player/beatmaps/route.js
src/app/api/osu/search/route.js
src/lib/osu.js:14-123 (env handling, token cache)
```

## Route table

| path | params | external calls | validation / rate limiting |
|---|---|---|---|
| GET /api/playlist | `url`\|\|`playlistId`\|\|`q` (400 if none) | `extractMusicData` -> spotify/apple/youtube host or raw text | none; 500 on extractor throw |
| GET /api/osu/search | `q`\|\|`title` (400 if neither), `artist`,`mode`(def all),`status`(def ranked),`source`,`fallback`,`fallbacks`(JSON array w/ raw-string fallback on parse fail),`strictness`(number, NOT `minScore`) | `searchOsuBeatmaps` -> osu.ppy.sh oauth token + `/beatmapsets/search` (multi-query) + artist probe `/beatmapsets/search?query=artist` | no rate limit; osu 429 surfaced via `.status` |
| GET /api/osu/player | `q`\|\|`userId` (400 if neither), `page` | `parseOsuProfileRef`/numeric-id direct lookup else `searchOsuUsers` -> osu.ppy.sh `/users/search` or `/users/{id}` | 429->429 msg, 404->"No osu! player found", else 500 |
| GET /api/osu/player/beatmaps | `userId`(400 if missing),`type`(must be one of best/most_played/favourite, 400 else),`mode`(def all),`status`(def any),`limit`(clamped 1-100, def 100) | `getUserBeatmapCollection` -> osu.ppy.sh `/users/{id}/scores/{type}` or `/beatmapsets/favourites`, one window (<=100), filtered+deduped locally | 429 mapped to friendly message |
| GET /api/download | `beatmapsetId`(400 if missing),`title`,`artist`,`creator`,`mirror` | tries 4 mirrors in order (catboy.best/d, api.nerinyan.moe/d, beatconnect.io/b, direct.sayobot.cn/osu) each w/ 6s AbortController timeout; streams `response.body` through on success; on total failure builds synthetic `.osz` via JSZip (`generateFallbackOsz`) | no auth/rate limit; `X-Selected-Mirror` header discloses fallback-generator |
| GET /api/status | none | none (reads env vars only) | none |
| GET /api/github/commits | none | `https://api.github.com/repos/sidlikesgrapess/osu-playlist-sync/commits?per_page=5`, in-memory cache TTL 120s, foreground refetch (no stale-while-revalidate), falls back to last-good cache on failure/429 | none |

All route handlers set `export const dynamic = 'force-dynamic'` (per CLAUDE.md convention, spot-checked in each file read above).
```

## Feature inventory

1. **Paste playlist/track/query link (playlist ingestion)**
   entry: `src/components/PlaylistInput.js:185` `handleSubmit` -> `onFetch(url, platform)` prop
   -> `src/app/page.js:125` `handleSubmitInput` -> routes non-player input to `src/app/page.js:334` `handleFetchPlaylist`
   -> `fetch('/api/playlist?url=...')` (browser -> /api/playlist -> spotify.com/embed or oembed, music.apple.com, youtube.com/oembed+innertube+scrape, or none for raw text) — no file bytes stream, JSON metadata only
   -> `src/app/api/playlist/route.js:1` -> `extractMusicData` (`src/lib/extractors.js:165`) -> per-platform fetcher (`fetchSpotifyEntity`/`fetchAppleMusicEntity`/`fetchYouTubeSingleVideo`/`src/lib/youtube.js:fetchPlaylistItems`) -> each song mapped through `cleanSongTitle` (`src/lib/titleCleaner.js:113`)
   -> back in page.js: builds `newSongs` with `blankMatchState()` (page.js:56), appends via `mergeSongs`, calls `searchTargetSongs` (page.js:408) only for the visible page
   -> `searchTargetSongs` fans out `fetch('/api/osu/search?...')` at concurrency 3 (browser -> /api/osu/search -> osu.ppy.sh oauth+`/beatmapsets/search`) — JSON only, no bytes
   files: `PlaylistInput.js`, `page.js`, `api/playlist/route.js`, `extractors.js`, `titleCleaner.js`, `youtube.js`, `api/osu/search/route.js`, `osu.js`

2. **osu! player search (profile lookup)**
   entry: `PlaylistInput.js:185` `handleSubmit` with platform `'player'` (or auto-detected via `osu.ppy.sh/(users|u)/` regex, `PlaylistInput.js:150`) -> `onFetch`
   -> `page.js:125` `handleSubmitInput` routes to `page.js:141` `handlePlayerSearch`
   -> browser -> `/api/osu/player?q=...&page=...` -> osu.ppy.sh `/search?mode=user` or direct `/users/{id}` — JSON only
   -> `api/osu/player/route.js` -> `parseOsuProfileRef`/`searchOsuUsers`/`getOsuUser` (`osu.js:88-263`)
   -> if `data.type==='profile'`: `page.js:187` `applyPlayerProfile` (seeds `playerSections`, opens 'best', calls `loadSection`); else sets `playerResults` -> renders `src/components/PlayerResults.js` (user picker grid) -> `onSelect` -> `page.js:208` `handleSelectPlayer` -> same profile fetch path
   files: `PlaylistInput.js`, `page.js`, `api/osu/player/route.js`, `osu.js`, `components/PlayerResults.js`, `components/PlayerProfile.js`

3. **Load / expand a player beatmap section (best / most played / favourites)**
   entry: `src/components/PlayerSections.js` section header click -> `onToggleSection(type)` prop -> `page.js:285` `handleToggleSection` (lazy-loads on first open)
   -> `page.js:236` `loadSection(userId,type,mode,status)` -> browser -> `/api/osu/player/beatmaps?userId=&type=&mode=&status=&limit=100` -> osu.ppy.sh `/users/{id}/scores/{type}` or `/beatmapsets/favourites`, one window, filtered+deduped locally (`getUserBeatmapCollection`, `osu.js:264`)
   -> items mapped via `page.js:34` `beatmapToSong` (pre-matched, `hasSearched:true`) -> merged into `songs` (`mergeSongs`) and into `playerSections[type].allItems`
   files: `components/PlayerSections.js`, `page.js`, `api/osu/player/beatmaps/route.js`, `osu.js`

4. **Change match strictness slider + Refetch**
   entry: slider in `PlaylistInput.js` -> `setMatchThreshold` prop -> `page.js:650` `handleMatchThresholdChange` (local state only, no network — deliberate)
   -> "Refetch" button, enabled by `canRefetchStrictness` (`page.js:664`) -> `onStrictnessRefetch` -> `page.js:656` `handleStrictnessRefetch` -> `page.js:545` `rematchVisiblePage` (drops all matches on current page, clears selection, re-searches) -> same `/api/osu/search` fan-out as feature 1, now with new `strictness` param -> `matchStrictness.js:strictnessProfile` turns it into `titleFloor`/`minScore`/`maxArtistRung`/`salvageFloor` inside `searchOsuBeatmaps`
   files: `PlaylistInput.js`, `page.js`, `api/osu/search/route.js`, `matchStrictness.js`, `osu.js`

5. **Change mode filter (All/osu/taiko/fruits/mania)**
   entry: `PlaylistInput.js` mode pills -> `setMode` -> `page.js:564` `handleModeChange`
   -> player mode: `page.js:300` `reloadPlayerSections(newMode,status)` (drops songs, reloads open sections only) — browser -> `/api/osu/player/beatmaps` again
   -> playlist mode: `page.js:545` `rematchVisiblePage` — browser -> `/api/osu/search` again
   files: `PlaylistInput.js`, `page.js`, `api/osu/player/beatmaps/route.js`, `api/osu/search/route.js`

6. **Change status filter (Ranked & Loved vs All)**
   entry: `PlaylistInput.js` status pills -> `setStatusFilter` -> `page.js:617` `handleStatusFilterChange`
   -> player mode -> `reloadPlayerSections`
   -> narrowing any->ranked and not mid-search -> `page.js:580` `narrowMatchesToRanked()` — **no network**, re-picks best candidate from already-fetched `allMatches` locally
   -> widening (ranked->any) or otherwise -> `rematchVisiblePage` (full re-search, since unranked sets were never fetched)
   files: `PlaylistInput.js`, `page.js` (narrowMatchesToRanked/isNarrowing at 580-615), `beatmapFormat.js:isRankedStatus`

7. **Manual per-song search / edit query**
   entry: `SongRow.js`/`SongCardMobile.js` inline edit (`isEditingQuery` state, `customQuery`) submit -> `onManualSearch(song.id, customQuery)` prop, threaded through `SongTable.js:230/251`
   -> `page.js:672` `handleManualSearch` -> browser -> `/api/osu/search?q=&mode=&status=&strictness=` **(no `artist`/`title`/`source` params — see Candidate duplication)**
   -> updates that one song's `matchedBeatmap`/`allMatches`/`rejection`, auto-selects if `!artistOverride`
   files: `SongRow.js`, `SongCardMobile.js`, `SongTable.js`, `page.js`, `api/osu/search/route.js`

8. **Select / deselect songs (checkbox, select-all, select-many)**
   entry: `OsuCheckbox.js` click -> `onToggleSelect`(`page.js:713`) / header checkbox -> `onSelectAll`(`page.js:722`)/`onDeselectAll`(`page.js:727`) in `SongTable.js:117-120,207` / `page.js:277` `handleSelectMany` (bulk from player sections)
   -> mutates `selectedIds` Set only — **no network**
   files: `OsuCheckbox.js`, `SongTable.js`, `PlayerSections.js`, `page.js`

9. **Select alternative match** (from a song's `allMatches`)
   entry: `SongTable.js` alt-picker modal (`altPickerSong` state, opened via `onOpenAltPicker` from `SongRow.js`/`SongCardMobile.js`) row click -> `onSelectAlternativeMatch(songId,newBeatmapset)` (`SongTable.js:499-501`)
   -> `page.js:861` `handleSelectAlternativeMatch` — simple `matchedBeatmap` swap, **no network**
   files: `SongTable.js`, `SongRow.js`, `SongCardMobile.js`, `page.js`

10. **Download single beatmap**
    entry: download icon -> `onDownloadSingle(song)` (`SongRow.js:463`/`SongCardMobile.js:430`/`PlayerSections.js` BeatmapRow) -> `page.js:742` `handleDownloadSingle`
    -> `fetchBeatmapArchive(beatmapId)` (`beatmapDownload.js:91`): browser -> CORS mirror `catboy.best/d/{id}` or `api.nerinyan.moe/d/{id}` directly (bytes stream straight to browser, bypassing our server) **or**, on failure, browser -> `/api/download?beatmapsetId=` (bytes DO stream through our function) -> that route itself tries 4 mirrors server-side then a synthetic `.osz`
    -> on success `downloadBlob` (page.js:65) triggers browser save; on total failure (non-silent) opens `https://catboy.best/d/{id}` in a new tab as last resort
    files: `SongRow.js`, `SongCardMobile.js`, `PlayerSections.js`, `page.js`, `lib/beatmapDownload.js`, `api/download/route.js`

11. **Batch download selected**
    entry: `StatsBar.js` "Download" button -> `onDownloadAction` -> `page.js:780` `handleDownloadBatch`
    -> sequential loop over `getSelectedSongs()` (page.js:777) sharing one `createProxyBudget()` (max 5 proxy fallbacks per batch), 600ms pacing, same mirror-then-proxy path as feature 10 per song, one aggregate toast (`DownloadToast.js`) at the end
    files: `StatsBar.js`, `page.js`, `beatmapDownload.js`, `api/download/route.js`, `DownloadToast.js`

12. **Bundle as ZIP**
    entry: `StatsBar.js` "Bundle as .ZIP" -> `onDownloadZipAction` -> `page.js:804` `handleDownloadZipBatch`
    -> same fetch-archive path as 10/11 per song, but blobs added into a `JSZip` instance client-side (not server-side), 400ms pacing, `zipProgress` state -> single generated zip blob -> `downloadBlob`
    files: `StatsBar.js`, `page.js` (JSZip import), `beatmapDownload.js`, `api/download/route.js`

13. **Export links (Web URL / osu! Direct / Text list)**
    entry: `StatsBar.js` "Export" -> `onOpenExport` -> `page.js` `isExportOpen=true` -> `ExportModal.js` renders `matchedSongs.map(format.line)` for one of 3 formats, "Copy to Clipboard" via `navigator.clipboard.writeText` — **no network at all**, pure client-side string formatting from already-held `song.matchedBeatmap` fields
    files: `StatsBar.js`, `page.js`, `ExportModal.js`

14. **Pagination (page / page size change)**
    entry: `SongTable.js` pager controls -> `onPageChange`(`page.js:513`)/`onPageSizeChange`(`page.js:524`) -> triggers `searchTargetSongs` only for unsearched songs newly brought into view (lazy search-on-scroll-into-page pattern)
    files: `SongTable.js`, `page.js`, `api/osu/search/route.js`

15. **Search All Remaining**
    entry: `StatsBar.js` "Search All (N)" -> `onSearchAllRemaining` -> `page.js:536` `handleSearchAllRemaining` -> searches every unsearched song across all pages via `searchTargetSongs`
    files: `StatsBar.js`, `page.js`, `api/osu/search/route.js`

16. **Clear list / Clear player**
    entry: `StatsBar.js` trash icon -> `onClearList` -> `page.js:873` `handleClearList` (resets songs/playlistMeta/selectedIds/errorMessage/currentPage) — **no network**
    entry: `PlayerProfile.js` "Change Player" -> `onClear` -> `page.js:324` `handleClearPlayer` — **no network**
    files: `StatsBar.js`, `PlayerProfile.js`, `page.js`

17. **Toggle sound effects**
    entry: `Navbar.js:126` SFX button -> `toggleSound` -> flips `osuAudio.enabled`, persists to `localStorage['osu_sfx_enabled']` — **no network, client-only**, `unverified` whether this is read anywhere else besides `Navbar.js` mount effect
    files: `Navbar.js`, `lib/soundEffects.js`

18. **Open setup guide / changelog modal**
    entry: `Navbar.js:151` "Online" button -> `onOpenSetupGuide` -> `page.js` `isSetupOpen=true` -> `SetupGuideModal.js` mounts, fetches `/api/github/commits` (cache:'no-store') for changelog list; shows `systemStatus.osuConfigured`/`defaultMirror` (from `/api/status`, fetched once on page mount, `page.js:117`)
    files: `Navbar.js`, `page.js`, `SetupGuideModal.js`, `api/github/commits/route.js`, `api/status/route.js`

19. **Report Issue (external link)**
    entry: `Navbar.js:179` anchor tag straight to `github.com/.../issues/new` — **no app code involved**, browser navigation only

20. **Hit-circle logo easter egg**
    entry: click on osu! logo in `Hero.js`/`Navbar.js`/`SetupGuideModal.js`(unverified for this one — logo there has no onClick observed) -> `easterRef.current.triggerHit(e)` -> `HitCircleEaster.js` renders an expanding ring + "300" judgement via a portal, plays `osuAudio.playClick()` — **no network, pure animation**
    files: `Hero.js`, `Navbar.js`, `HitCircleEaster.js`, `soundEffects.js`

## Song object lifecycle

**Creation sites:**
- `src/lib/extractors.js:165` `extractMusicData` — one song per track from Spotify/Apple/YouTube extractor, immediately passed through `cleanSongTitle` to populate `source,cleanQuery,extractedTitle,extractedArtist,fallbacks,queries`; base fields (`id,title,channelTitle,thumbnail,duration,position`) come from the per-platform fetcher in the same file / `youtube.js`.
- `src/app/page.js:334` `handleFetchPlaylist` — wraps each extractor song with `blankMatchState()` (page.js:56: `hasSearched:false,isSearching:false,matchedBeatmap:null,allMatches:[],rejection:null`) to get the full shape before it enters `songs`.
- `src/app/page.js:34` `beatmapToSong(item,section)` — player path only; builds an **already-matched** song (`hasSearched:true,isSearching:false,matchedBeatmap:beatmapset,allMatches:[beatmapset]`) directly from an osu! collection item, plus `playerMeta`/`playerSection` extras not present on the playlist path.

**page.js mutation sites (every place `songs` is set/updated):**
- `page.js:226` `mergeSongs(incoming)` — dedupe-by-id append, used by both `handleFetchPlaylist` and `loadSection`.
- `page.js:408` `searchTargetSongs` — sets `isSearching:true` on targets, then on each `/api/osu/search` response sets `hasSearched:true,isSearching:false,matchedBeatmap,allMatches,rejection`.
- `page.js:580` `narrowMatchesToRanked` — re-derives `matchedBeatmap`/`rejection` from existing `allMatches` without a new match state, per song.
- `page.js:545` `rematchVisiblePage` — resets every visible song to `blankMatchState()` before re-searching.
- `page.js:672` `handleManualSearch` — updates one song's match state from a manual `/api/osu/search` call.
- `page.js:861` `handleSelectAlternativeMatch` — swaps `matchedBeatmap` only (from `allMatches`).
- `page.js:873` `handleClearList` — replaces `songs` with `[]`.
- `page.js:277` `handleSelectMany` — does not mutate song fields, only `selectedIds`.

**Component song-prop consumers:**
- `SongTable.js` — receives the full `songs` array (paginated via `pageSlice`) plus all handler callbacks; renders `SongRow` (desktop) or `SongCardMobile` (mobile) per song.
- `SongRow.js` / `SongCardMobile.js` — receive one `song` each plus `isSelected,activeAudio,onToggleAudio,onDownloadSingle,isDownloading,onOpenAltPicker,onManualSearch,onToggleSelect`; **identical prop signatures and near-identical render logic** (see Candidate duplication).
- `PlayerSections.js` (`BeatmapRow`) — receives one `song` (always a `beatmapToSong` result) plus `isSelected,onToggleSelect,onDownloadSingle,isDownloading,activeAudio,onToggleAudio`; reads `song.playerMeta` for pp/rank/playCount badges that playlist-path songs never carry.
- `ExportModal.js` — receives the whole `songs` array, filters to `s.matchedBeatmap` locally, reads only `song.matchedBeatmap.*` fields (no mutation).

## Candidate duplication

- `RANKED_STATUSES` (`src/lib/osu.js:237` = `['ranked','loved','qualified','approved']`) vs `RANKED_AND_LOVED` (`src/lib/beatmapFormat.js:35` = `['ranked','loved','qualified']`) — disagree on `'approved'`, despite `beatmapFormat.js:28-33`'s own comment insisting these two lists must never disagree ("narrowing the filter locally would keep a different set of beatmaps than refetching with it would").
- `handleManualSearch` (`page.js:672`) calls `/api/osu/search` without `artist`/`title`/`source` params, unlike `searchTargetSongs` (`page.js:408`) which passes all three — manual search may skip structured-artist trust (`source==='spotify'||'apple'`) and the artist gate entirely for songs that would otherwise get it automatically.
- `formatBeatmapset`'s `downloadUrl` field (`osu.js:905`, `/api/download?beatmapsetId=`) has **no consumer anywhere in `src/`** (grepped `downloadUrl` repo-wide) — the real download path (`page.js:744,818` -> `beatmapDownload.js:fetchBeatmapArchive`) reads `matchedBeatmap.id` directly and independently reconstructs the same proxy URL via `beatmapDownload.js:31` `proxyUrl()`. Two separate places build `/api/download?beatmapsetId=...`; only one is ever called.
- `SongRow.js` and `SongCardMobile.js` have identical prop signatures (`song,isSelected,onToggleSelect,activeAudio,onToggleAudio,onDownloadSingle,isDownloading,onOpenAltPicker,onManualSearch`) and near-identical internal logic (manual-query edit state, rejection describe, alt-match count) — intentional desktop/mobile split per CLAUDE.md convention, but every behavioural change must land in both and nothing enforces that beyond code review.
- `getUserBeatmapCollection` (`osu.js:264`) filters-then-dedupes (`matchesCollectionFilters` then `dedupeByBeatmapset`/`mergeBeatmapsetEntries`, `osu.js:193-244`), deliberately in that order per its own comment; worth flagging only because `searchOsuBeatmaps` (`osu.js:671`) has its own separate dedupe-ish pooling (`allFoundSets`/`gatedOut`) that is not the same function — two different "collapse duplicate beatmapsets" mechanisms exist in the same file for two different endpoints.

<!-- MAP COMPLETE -->
