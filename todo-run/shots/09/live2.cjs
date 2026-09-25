const { chromium } = require('playwright'); const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';
(async () => {
  const guard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(2); }, 120000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); const api = [];
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.includes('/api/osu/')) api.push(u.replace(BASE, ''));
    if (/catboy|nerinyan|\/api\/download|b\.ppy\.sh\/preview/.test(u)) return r.fulfill({ status: 404, body: '' }); return r.continue(); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#playlist-url-input'); await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('#search-mode-player-btn').click());
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'mrekk').click());
  await page.waitForTimeout(12000);
  await page.screenshot({ path: path.join(OUT, 'live2_player.png'), fullPage: true });
  const t = await page.evaluate(() => document.body.innerText);
  console.log(api, t.slice(t.indexOf('Try sample'), t.indexOf('Try sample') + 1500));
  clearTimeout(guard); await browser.close();
})();
