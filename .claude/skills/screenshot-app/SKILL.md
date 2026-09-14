---
name: screenshot-app
description: Launch osu!Sync and drive it with headless Chromium to capture desktop + mobile screenshots of real app states (song search results, Online status popup, player profile lookup). Use when asked to screenshot the app, refresh README images, or visually verify a UI change in the running app.
---

# Screenshotting osu!Sync

Playwright drives a real Chromium against `npm run dev`. Output lands wherever
`OUT_DIR` points — use `images/` only when the screenshots are meant to be committed.

## 1. Start the dev server

```bash
npm run dev > /tmp/osu-dev.log 2>&1 &
timeout 40 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 1; done'
```

Poll the port — don't `sleep`. First compile takes a few seconds.

Never run `npm run build` while dev is up (see CLAUDE.md — it wipes `.next/` chunks).

## 2. Capture

```bash
export NODE_PATH="$(npm root -g)"
export OUT_DIR="$PWD/images"
node .claude/skills/screenshot-app/capture.js
```

**Playwright is not a project dependency.** It is installed globally, and its
Chromium is already downloaded under `%LOCALAPPDATA%\ms-playwright`. `NODE_PATH`
is what lets `require('playwright')` resolve — without it the script dies on the
first line. Don't `npm install playwright` into this repo to fix that.

`OUT_DIR` must be exported **before** the command. Passing `OUT_DIR=... node script.js`
as a trailing argv does nothing, and the screenshots silently scatter into the
repo root instead.

## 3. Stop the dev server

`lsof` is not available here. Find the listener and kill the tree:

```bash
PID=$(netstat -ano | grep ":3000" | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID "$PID" //T
```

## The hydration gotcha

This is the one that will waste your time. `waitForSelector` resolves as soon as
the element exists in the server-rendered HTML — **before React has attached its
handlers**. A click that lands in that window is silently swallowed: no error, no
navigation, the screenshot just shows an unchanged page.

Every flow in `capture.js` therefore does:

```js
await page.waitForSelector('#playlist-url-input');
await page.waitForTimeout(800);   // let hydration attach handlers
```

If a click "works but nothing happens," this is why. Add the settle wait, don't
hunt for a better selector.

## Selector map

| Target | Selector |
|---|---|
| Search / URL input | `#playlist-url-input` |
| Platform dropdown trigger | `#platform-dropdown-btn` |
| Dropdown options | `text=Single Song Search`, `text=Player Search (osu! profile)` |
| Sample chips | `#preset-player-mrekk`, and siblings in `SAMPLES` (PlaylistInput.js) |
| Online / status popup | `page.getByRole('button', { name: /Online/ })` |
| Popup is open | `text=Got it!` |
| A specific player in results | `img[alt="<username>"]` — alt is the exact username, so `img[alt="mrekk"]` hits the real #1 player and not "Mrekk 2", "mrekk italiano", … |

Player search returns a **fuzzy list**, not a profile. To screenshot an actual
profile you must click through the result card; searching `mrekk` alone lands you
on a grid of 193 impersonators.

Submitting: the input handles `Enter`, so `page.press('#playlist-url-input', 'Enter')`
is enough — no need to find the Find button.

## Notes

- Sound effects default to off (`osuAudio.enabled === false`), so click handlers
  never touch the Web Audio API. Not a source of headless flakiness.
- Player and song searches hit the real osu! API via `.env.local` credentials.
  Results (pp, rank, beatmap counts) drift between runs — that's expected, not a bug.
- Chromium launches with `--no-sandbox --disable-gpu --disable-dev-shm-usage`.
  Plain headless Chrome / Puppeteer launched by hand tends to hang in this shell;
  Playwright's bundled Chromium does not.
