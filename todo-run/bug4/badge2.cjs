// Scrolls the Spotify track result in 20px steps and clips the badge each time, to look for the strike.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  setTimeout(() => process.exit(2), 120000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1207, height: 532 }, deviceScaleFactor: Number(process.env.DPR || 1) });
  await ctx.route(/ppy.sh/, (r) => r.abort());
  await ctx.route('**/api/osu/**', (r) => r.fulfill({ json: { beatmapsets: [{ id: 2403954, title: 'atrophy', titleUnicode: 'atrophy', artist: 'lexycat', artistUnicode: 'lexycat', creator: 'Ldnz', creatorId: 1, status: 'ranked', bpm: 175, covers: { list: '', card: '', cover: '', slimcover: '' }, favouriteCount: 1, playCount: 1, previewUrl: '', matchScore: 200, difficulties: [{ id: 1, difficultyRating: 5.7, version: 'X', mode: 'osu', bpm: 175, totalLength: 120 }], starRange: { min: 1.8, max: 5.7 } }] } }));
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input'); await page.waitForTimeout(800);
  await page.fill('#playlist-url-input', 'https://open.spotify.com/track/51kTzw2J1el6vN2qpNTtAR'); await page.press('#playlist-url-input', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('h2').length > 1, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  for (let y = 100; y <= 400; y += 20) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(250);
    const r = await page.evaluate(() => { const b = [...document.querySelectorAll('span')].find((s) => s.textContent === 'Single Song'); const q = b.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height }; });
    if (r.y < 0 || r.y > 520) continue;
    await page.screenshot({ path: path.join(__dirname, `strip${process.env.DPR || 1}_${y}.png`), clip: { x: 0, y: Math.max(0, r.y - 30), width: 600, height: 70 } });
  }
  await browser.close(); process.exit(0);
})();
