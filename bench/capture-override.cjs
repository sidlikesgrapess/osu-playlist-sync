// DEV-ONLY (bench/): matching benchmark harness. Not imported by src/, not deployed.
/**
 * A wrong-artist result is shown like any other match, badged, and must NOT be pre-selected.
 * This checks all three. Requires `npm run dev` and NODE_PATH set to the global modules.
 */
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.env.OUT_DIR || process.cwd();

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForSelector('#playlist-url-input');
    await page.waitForTimeout(800); // hydration
    await page.fill('#playlist-url-input', 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
    await page.press('#playlist-url-input', 'Enter');
    await page.waitForTimeout(20000);
    await page.waitForSelector('#pagination-page-3', { timeout: 20000 });
    await page.click('#pagination-page-3');
    await page.waitForTimeout(25000);

    const row = await page.evaluate(() => {
      const r = [...document.querySelectorAll('tr')].find(x => /DAISIES/i.test(x.textContent || ''));
      if (!r) return null;
      r.scrollIntoView({ block: 'center' });
      // The select control is a custom component, so read its state off aria/data rather
      // than assuming a native <input type=checkbox>.
      const ctrl = r.querySelector('[role=checkbox], input[type=checkbox], [aria-checked]');
      return {
        text: r.innerText.replace(/\n+/g, ' | ').trim(),
        selected: ctrl ? (ctrl.getAttribute('aria-checked') ?? String(ctrl.checked)) : 'control not found',
      };
    });
    console.log('row:', row && row.text);
    console.log('selected:', row && row.selected);

    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'override-row.png') });
    console.log('saved override-row.png');

    // SongCardMobile is a separate component, so the badge has to be checked there too.
    const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await m.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await m.waitForSelector('#playlist-url-input');
    await m.waitForTimeout(800);
    await m.fill('#playlist-url-input', 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
    await m.press('#playlist-url-input', 'Enter');
    await m.waitForTimeout(20000);
    await m.waitForSelector('#pagination-page-3', { timeout: 20000 });
    await m.click('#pagination-page-3');
    await m.waitForTimeout(25000);
    const found = await m.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(e => /^Could not find one by /i.test((e.textContent || '').trim()));
      if (el) { el.scrollIntoView({ block: 'center' }); return el.textContent.trim(); }
      return null;
    });
    console.log('mobile notice:', found || 'NOT RENDERED');
    await m.waitForTimeout(600);
    await m.screenshot({ path: path.join(OUT, 'override-mobile.png') });
    console.log('saved override-mobile.png');
  } catch (e) {
    console.error('failed:', e.message);
    process.exitCode = 1;
  } finally { await browser.close(); }
})();
