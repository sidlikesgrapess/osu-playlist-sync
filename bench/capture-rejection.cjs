// DEV-ONLY (bench/): matching benchmark harness. Not imported by src/, not deployed.
/**
 * Searches the whole playlist (not just the visible page) and captures the wrong-artist
 * rejection copy, which only appears for a track whose song IS on osu! under a different
 * artist. Those sit deeper in the list than the first page of results.
 */
const { chromium } = require('playwright');
const path = require('path');

const OUT = process.env.OUT_DIR || process.cwd();
const PLAYLIST = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForSelector('#playlist-url-input');
    await page.waitForTimeout(800); // hydration: handlers attach after the markup exists

    await page.fill('#playlist-url-input', PLAYLIST);
    await page.press('#playlist-url-input', 'Enter');
    await page.waitForTimeout(20000);

    // Rows are paginated, so a deeper track is not in the DOM at all. Page 3 holds
    // "DAISIES" by Justin Bieber, which the API classifies as wrong-artist.
    console.log('navigating to page 3...');
    await page.waitForSelector('#pagination-page-3', { timeout: 20000 });
    await page.click('#pagination-page-3');
    await page.waitForTimeout(25000); // the page auto-searches its unsearched rows

    const text = await page.evaluate(() => document.body.innerText);
    const lines = text.split('\n').map(l => l.trim())
      .filter(l => /not by |no beatmaps on osu|could not be verified|No matching beatmapset/i.test(l));
    console.log('\n--- every rejection line rendered ---');
    [...new Set(lines)].forEach(l => console.log('   ', l));

    // Scroll to the first wrong-artist row and shoot it.
    const found = await page.evaluate(() => {
      const el = [...document.querySelectorAll('span')].find(e => /not by /i.test(e.textContent || ''));
      if (el) { el.scrollIntoView({ block: 'center' }); return el.textContent.trim(); }
      return null;
    });
    if (found) {
      console.log('\nwrong-artist row:', found);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, 'ui-wrong-artist.png') });
      console.log('  saved ui-wrong-artist.png');
    } else {
      console.log('\nno wrong-artist row rendered on this playlist');
    }
  } catch (e) {
    console.error('failed:', e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
