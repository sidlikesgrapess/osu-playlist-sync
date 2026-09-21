// DEV-ONLY (bench/): matching benchmark harness. Not imported by src/, not deployed.
/**
 * Drives the real app to verify the artist gate and the Stage 4 rejection messages in the UI.
 *
 *   npm run dev            (must already be running)
 *   export NODE_PATH="$(npm root -g)"
 *   export OUT_DIR="<somewhere>"
 *   node bench/capture-ui.mjs
 */
const { chromium } = require('playwright');
const path = require('path');

const OUT = process.env.OUT_DIR || process.cwd();
const URL_UNDER_TEST = 'http://localhost:3000';

// A mainstream pop playlist: most tracks are not mapped on osu!, which is what surfaces
// the rejection messages. A niche/rhythm-game playlist would match everything and show none.
const PLAYLIST = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const shot = async (page, name) => {
    const file = path.join(OUT, name);
    await page.screenshot({ path: file, fullPage: false });
    console.log('  saved', file);
  };

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });
    await page.waitForSelector('#playlist-url-input');
    // waitForSelector resolves on server-rendered HTML, before React attaches handlers;
    // a click inside that window is silently swallowed.
    await page.waitForTimeout(800);

    console.log('loading playlist...');
    await page.fill('#playlist-url-input', PLAYLIST);
    await page.press('#playlist-url-input', 'Enter');

    // Matching fans out at concurrency 3, so give the rows time to resolve.
    await page.waitForTimeout(25000);
    await shot(page, 'ui-desktop-results.png');

    // Scroll through looking for the new rejection copy.
    const wanted = [/not by /i, /has no beatmaps on osu/i, /could not be verified/i];
    for (let i = 0; i < 6; i++) {
      const text = await page.evaluate(() => document.body.innerText);
      const hits = wanted.filter(re => re.test(text));
      if (hits.length) {
        console.log('  rejection copy found:', hits.map(String).join(', '));
        await shot(page, `ui-desktop-rejection-${i}.png`);
        break;
      }
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(1500);
    }

    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('\n--- rejection lines present in the DOM ---');
    bodyText.split('\n')
      .filter(l => /not by |no beatmaps on osu|could not be verified|No matching beatmapset/i.test(l))
      .slice(0, 12)
      .forEach(l => console.log('   ', l.trim()));

    // Mobile: SongCardMobile is a separate component, so it needs its own check.
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(URL_UNDER_TEST, { waitUntil: 'networkidle' });
    await mobile.waitForSelector('#playlist-url-input');
    await mobile.waitForTimeout(800);
    await mobile.fill('#playlist-url-input', PLAYLIST);
    await mobile.press('#playlist-url-input', 'Enter');
    await mobile.waitForTimeout(25000);
    await shot(mobile, 'ui-mobile-results.png');
  } catch (e) {
    console.error('capture failed:', e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
