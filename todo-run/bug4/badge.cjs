// Screenshots the playlist title badge after a Spotify track load, at a few scroll offsets.
// /api/osu is mocked (no osu! API calls). Run: NODE_PATH="$(npm root -g)" node todo-run/bug4/badge.cjs [url]
const { chromium } = require('playwright');
const path = require('path');
const URL_IN = process.argv[2] || 'https://open.spotify.com/track/51kTzw2J1el6vN2qpNTtAR?si=14eed5c735d54264';
(async () => {
  setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 120000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const out = {};
  for (const vp of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone', width: 375, height: 812 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    if (!process.env.LIVE) await ctx.route('**/api/osu/**', (r) => r.fulfill({ json: { beatmapsets: [], rejection: 'no-match' } }));
    const page = await ctx.newPage();
    const csp = [];
    page.on('console', (m) => { if (/Content Security Policy/.test(m.text())) csp.push(m.text().slice(0, 120)); });
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#playlist-url-input'); await page.waitForTimeout(800);
    await page.fill('#playlist-url-input', URL_IN); await page.press('#playlist-url-input', 'Enter');
    await page.waitForFunction(() => document.querySelectorAll('h2').length > 1, null, { timeout: 30000 });
    await page.waitForTimeout(process.env.LIVE ? 9000 : 1500);
    for (const y of [0, 150, 300]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(__dirname, `${process.env.TAG || 'badge'}_${vp.name}_${y}.png`) });
    }
    out[vp.name] = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('tbody tr, [data-song-card]')].map((t) => t.innerText.replace(/s+/g, ' ').slice(0, 220)),
      imgs: [...document.querySelectorAll('img')].filter((i) => !/osuLogo|grades/.test(i.src)).map((i) => ({ src: i.src.slice(0, 70), ok: i.naturalWidth > 0 })),
    }));
    out[vp.name].csp = csp;
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
