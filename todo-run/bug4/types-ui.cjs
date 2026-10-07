// Loads an Apple album, a Spotify radio playlist and a YouTube Mix link in the app (osu! search
// mocked), on desktop and phone, and reports rows, covers, the unavailable notice and CSP errors.
// Run: NODE_PATH="$(npm root -g)" node todo-run/bug4/types-ui.cjs
const { chromium } = require('playwright');
const path = require('path');
const LINKS = {
  apple_album: 'https://music.apple.com/us/album/guts/1694767605',
  spotify_radio: 'https://open.spotify.com/playlist/37i9dQZF1E4yECoBSV4t3b',
  yt_mix: 'https://www.youtube.com/watch?v=ZRtdQ81jPUQ&list=RDZRtdQ81jPUQ&start_radio=1',
};
(async () => {
  setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 240000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const out = {};
  for (const vp of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone', width: 375, height: 812 }]) {
    for (const [key, link] of Object.entries(LINKS)) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      await ctx.route('**/api/osu/**', (r) => r.fulfill({ json: { beatmapsets: [], rejection: 'no-match' } }));
      const page = await ctx.newPage();
      const csp = [];
      page.on('console', (m) => { if (/Content Security Policy/.test(m.text())) csp.push(m.text().slice(0, 100)); });
      await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#playlist-url-input'); await page.waitForTimeout(800);
      await page.fill('#playlist-url-input', link); await page.press('#playlist-url-input', 'Enter');
      await page.waitForFunction(() => document.querySelectorAll('h2').length > 1 || /Could not/.test(document.body.innerText), null, { timeout: 45000 });
      await page.waitForTimeout(2500);
      await page.evaluate(() => window.scrollTo(0, 250)); await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(__dirname, `ui_${key}_${vp.name}.png`) });
      out[`${key}/${vp.name}`] = await page.evaluate(() => {
        const thumbs = [...document.querySelectorAll('.osu-thumb-container img, img')].filter((i) => /mzstatic|scdn|spotifycdn|ytimg/.test(i.src));
        return {
          title: [...document.querySelectorAll('h2')].pop()?.parentElement.innerText.replace(/\s+/g, ' '),
          notice: (document.body.innerText.match(/Showing \d+ of \d+ songs\.[^\n]*/) || [null])[0],
          stats: (document.body.innerText.match(/PLAYLIST SONGS\s*\d+/i) || [null])[0],
          covers: thumbs.length, coversLoaded: thumbs.filter((i) => i.naturalWidth > 0).length,
          error: (document.body.innerText.match(/Could not[^\n]*/) || [null])[0],
        };
      });
      out[`${key}/${vp.name}`].csp = csp.length;
      await ctx.close();
    }
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
