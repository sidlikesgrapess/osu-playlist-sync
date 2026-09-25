# 06 Mode switcher to 2 modes

Todo: "mode switcher has yt,spotify, AM, single song combine them into playlist/song search. So then we will have song/playlist saerch and player search"

## Scope

Current state (before this item):
- The switcher is a portal dropdown in the search bar with six entries: PLATFORM_OPTIONS at
  src/components/PlaylistInput.js:24-31 (auto/youtube/spotify/apple/query/player). Trigger
  #platform-dropdown-btn (:370-402), menu #platform-dropdown-portal-menu via createPortal
  (:405-457), state isPlatformMenuOpen/menuPos/mounted/menuRef (:91-94), updateMenuPos
  (:100-108), a scroll listener tied to the menu (:110-129), an outside click closer (:132-145).
- selectedPlatform is plain useState('auto') (:90), never saved to localStorage.
  detectPlatform (:151-155) returns it unless 'auto', else classifyInput(url).kind
  (src/lib/platform.js:49-84), with 'invalid' mapped to 'auto'.
- The only consumer of the submitted platform is page.js:190-194 handleSubmitInput, which checks
  only `platform === 'player'` or the osu.ppy.sh/users regex. Everything else goes to
  handleFetchPlaylist, which sends only the text to /api/playlist; the server reclassifies it
  (extractors.js:364; 'query' gives platform 'query', isSingleTrack true, :335-342). So the
  YouTube/Spotify/Apple/Single Song entries only ever changed the icon and placeholder.
- Samples (:35-40) call handleQuickSample(value, platform||'auto') (:193-197); only mrekk passes
  'player'. A sample click does not update the switcher.
- Phone CSS globals.css (max-width 480px) hides .pi-label-text/.pi-chevron and shrinks
  #platform-dropdown-btn.
- Other consumers of the old selectors: .claude/skills/screenshot-app/capture.js and SKILL.md,
  rebuild-notes/verify/smoke.mjs and smoke-zip-fix.mjs (todo-run/shots/03, 05 are historical).

Decisions:
- USER DECIDED: a two segment toggle [ Playlist / Song | Player ] visible in the search bar,
  replacing the dropdown. One click to switch.
- Playlist / Song is the default and routes by classifyInput: links go to their provider, plain
  text is a single song search (source 'query'), an osu! profile link still opens the player.
- The Playlist / Song segment icon follows the detected provider live (the old auto feedback).
- Pure mapping lives in src/lib/platform.js (submitPlatform) with node --test coverage.
- Phone: keep text labels, hide only segment icons, shrink padding and font.

Acceptance:
1. Two segment toggle (#search-mode-songs-btn, #search-mode-player-btn, role=radio in a
   radiogroup, aria-checked). No #platform-dropdown-btn / #platform-dropdown-portal-menu;
   createPortal and ChevronDown removed.
2. One click switches; the active segment is visually distinct and aria-checked=true.
3. Playlist / Song is default, placeholder names links and song titles with no dash punctuation;
   Player placeholder is the existing player text; hasSongs keeps "Paste another link..." copy.
4. Songs segment icon follows classifyInput live (YouTube/Spotify/Apple icon, music note for
   text, sparkles when empty or invalid).
5. 'YOASOBI - Idol' in Playlist / Song gives /api/playlist platform 'query', isSingleTrack true,
   the Single Song badge, and a source=query row search.
6. YouTube/Spotify/Apple links load as before; an osu.ppy.sh/users link in Playlist / Song still
   opens the player view.
7. Player mode + 'mrekk' calls /api/osu/player, not /api/playlist.
8. All four samples work and sync the toggle (mrekk selects Player, the rest Playlist / Song).
9. The docked search bar still shows a working toggle.
10. At 375x812 toggle, input, Clear, Find fit one row, no horizontal overflow, input >= 100px.
    1280x800 unchanged apart from the toggle.
11. No stale selectable platform id in PlaylistInput; old dropdown CSS removed or retargeted.
12. screenshot-app skill and rebuild-notes/verify/smoke*.mjs use the new selectors.
13. npm test: at least 165 tests, 0 fail.

## Implementation

Not committed. Files changed:

- src/lib/platform.js:107-125: new `SEARCH_MODES` (:114) and pure `submitPlatform(mode, raw)` (:121):
  'player' mode always gives 'player'; 'songs' gives `classifyInput(raw).kind` with 'invalid'
  mapped to 'auto'. This is exactly the old Auto path (detectPlatform) plus the player override,
  so page.js:190-194 needed no change. Header comment (:6-7) updated to name the new user.
- test/platform.test.mjs:4 (import), :81-109: six tests (plain text gives 'query'; Spotify,
  YouTube, Apple links give their provider; profile link in songs mode gives 'player'; empty and
  unknown link give 'auto'; player mode with a link still 'player'; SEARCH_MODES shape).
- src/components/PlaylistInput.js:
  - :3-4 dropped useRef, createPortal, ChevronDown; :9 imports submitPlatform instead of classifyInput.
  - :23-31 PLATFORM_OPTIONS (six ids) replaced by SEARCH_MODE_OPTIONS: 'songs' (Playlist / Song)
    and 'player' (Player). No youtube/spotify/apple/query selectable id remains.
  - :88 `searchMode` state ('songs' default) replaces selectedPlatform plus the menu state
    (isPlatformMenuOpen, menuPos, mounted, menuRef), updateMenuPos, and the outside click effect.
    The scroll effect now only sets isDocked with an empty dependency list.
  - :113 submit platform = submitPlatform(searchMode, url); :116 songsIcon = live detected kind
    for the Playlist / Song segment icon (and data-detected attribute for tests).
  - :135-139 placeholder: player text in Player; "Paste another link..." when hasSongs; else the
    new dash free songs placeholder.
  - :141-145 handleSearchModeChange (one click, click sfx, no op on the active segment).
  - :159 handleQuickSample syncs the toggle (mrekk selects Player, others Playlist / Song).
  - :334-390 the dropdown trigger and portal menu replaced by a role="radiogroup"
    aria-label="Search type" of two role="radio" buttons #search-mode-songs-btn /
    #search-mode-player-btn with aria-checked; active segment has a pink border and lighter fill.
  - :320 className pi-search-bar on the bar row, :422 className pi-clear-btn on Clear (phone CSS hooks).
- src/app/globals.css:271-298 (max-width 480px): old .pi-label-text/.pi-chevron and
  #platform-dropdown-btn rules replaced. Segment icons hidden, labels kept, segment padding 3px 5px
  at 0.64rem, bar gap and padding 4px, Clear padding 2px 1px. First pass (0.68rem, default gutters)
  left the phone input at 79px with Clear shown, which failed the 100px criterion; now 106px.
- Old selector consumers retargeted to the toggle: .claude/skills/screenshot-app/capture.js:24,
  .claude/skills/screenshot-app/SKILL.md:70, rebuild-notes/verify/smoke.mjs:114,186,
  rebuild-notes/verify/smoke-zip-fix.mjs:38. Historical todo-run/shots/03, 05 scripts left as is.

Checks:
- npm test: 193 tests, 192 pass, 0 fail, 1 todo (baseline 165/164/0/1; 01-05 and these 6 added).
- npm run bench skipped: no matching file touched.
- Playwright sanity todo-run/shots/06/sanity.cjs (osu! routes mocked, link /api/playlist mocked,
  plain text live), output todo-run/shots/06/sanity-output.json, both 1280x800 and 375x812:
  old dropdown count 0; songs checked by default; icon follows spotify/youtube/apple/query/auto;
  'YOASOBI - Idol' gives /api/playlist platform 'query', isSingleTrack true, Single Song badge
  visible, row search source=query; Player click flips aria-checked and placeholder; 'mrekk' in
  Player hits only /api/osu/player; all four samples fire the right endpoint and sync the toggle;
  an osu.ppy.sh/users/2 link in Playlist / Song hits /api/osu/player; docked bar toggle visible and
  clickable; no horizontal overflow; no page errors. todo-run/shots/06/sanity-phone-width.cjs:
  phone input 106px with Clear shown, no overflow. Screenshots sanity-*.png in the same folder.
- Note: while this stage ran, commit a41c507 (another agent) reverted item 05's bounce in
  globals.css; this item's globals.css diff is only the 480px block.

## Verification

Round 1, all three lenses passed. No must fix findings.

- Regression: npm test 193/192/0/1 vs baseline 165/164/0/1 (only todo is F-28,
  test/search-replay.test.mjs:272). page.js unchanged; submitPlatform (src/lib/platform.js:121-125)
  reproduces old Auto routing. No stale dropdown selectors in live code. Own Playwright run
  (todo-run/shots/06/verify-regression-r1.cjs) passed at 1280x800 and 375x812.
- Acceptance: todo-run/shots/06/verify-accept.cjs (output va-output.txt): dropdown gone, radiogroup
  present, one click switches, Playlist / Song default, placeholders dash free, icon follows input,
  plain text gives platform 'query' with Single Song badge, Player hits only /api/osu/player, all four
  samples sync the toggle, docked bar toggle works, phone row fits (input 106px, no overflow).
- Rules: no dash in new copy, general rule not a list, bench/ untouched, no debug logging.

Follow ups (not must fix):
- Phone Clear button padding 2px 1px gives a small tap target (globals.css 480px block).
- Segment icons hidden at 480px and below, so phones do not see the live provider icon.
- Segments lack arrow key roving tabindex (usual ARIA radiogroup pattern).
- SEARCH_MODES in src/lib/platform.js:114 is exported but unused by src; second source of truth
  next to SEARCH_MODE_OPTIONS.
- Two comments describe the removed dropdown (PlaylistInput.js:23-25, :334).
- Unrelated: three console 404s after list load (likely thumbnails).
