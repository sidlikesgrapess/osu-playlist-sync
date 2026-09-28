// Dock seam check with every /api/osu call mocked. Run: NODE_PATH="$(npm root -g)" node todo-run/shots/polish/seam.cjs
const { chromium } = require('playwright');
const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';
const set = (i) => ({ id: 1000 + i, title: `Song ${i}`, titleUnicode: `Song ${i}`, artist: `Artist ${i}`, artistUnicode: `Artist ${i}`,
  creator: 'mapper', creatorId: 1, status: 'ranked', bpm: 180, covers: { list: '', card: '', cover: '', slimcover: '' },
  favouriteCount: 1, playCount: 1, previewUrl: '', difficulties: [{ id: 5000 + i, difficultyRating: 6.2, version: 'Hard', mode: 'osu', bpm: 180, totalLength: 120 }],
  starRange: { min: 6.2, max: 6.2 } });
const items = (type, n) => Array.from({ length: n }, (_, i) => ({ beatmapset: set(i + (type === 'best' ? 0 : 200)), meta: type === 'best' ? { pp: 500, rank: 'S', accuracy: 98, mods: [] } : { playCount: 10 } }));
(async () => {
  setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 150000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const out = {};
  for (const vp of [{ name: 'desktop', width: 1280, height: 800, dpr: 1 }, { name: 'desktop125', width: 1280, height: 800, dpr: 1.25 }, { name: 'phone', width: 375, height: 812, dpr: 2 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
    await ctx.route(/ppy\.sh/, (r) => r.abort());
    await ctx.route('**/api/osu/**', (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === '/api/osu/player/beatmaps') { const t = u.searchParams.get('type'); return route.fulfill({ json: { type: t, items: items(t, 100), fetched: 100, total: 100 } }); }
      if (u.pathname === '/api/osu/player' && u.searchParams.get('q')) return route.fulfill({ json: { type: 'results', users: [{ id: 42, username: 'mockuser', avatarUrl: 'https://a.ppy.sh/42', countryCode: 'US', isSupporter: false }], total: 1, page: 1 } });
      if (u.pathname === '/api/osu/player') return route.fulfill({ json: { type: 'profile', user: { id: 42, username: 'mockuser', avatarUrl: 'https://a.ppy.sh/42', countryCode: 'US', isSupporter: false, coverUrl: null, globalRank: 1, countryRank: 1, pp: 1, playCount: 1, counts: { best: 100, most_played: 100, favourite: 100 } } } });
      return route.abort();
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#playlist-url-input'); await page.waitForTimeout(800);
    await page.click('#search-mode-player-btn'); await page.waitForTimeout(300);
    await page.fill('#playlist-url-input', 'mockuser'); await page.press('#playlist-url-input', 'Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /mockuser/.test(b.textContent)), null, { timeout: 20000 });
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /mockuser/.test(b.textContent) && !b.querySelector('input')).click());
    await page.waitForFunction(() => document.querySelectorAll('[data-section="best"] [id^="checkbox-"]').length > 0, null, { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.click('[data-section="best"] [id^="checkbox-"] >> nth=0'); await page.waitForTimeout(300);
    await page.click('#search-mode-songs-btn').catch(async () => page.getByRole('button', { name: /Playlist \/ Song/ }).first().click());
    await page.waitForTimeout(600);
    const note = await page.evaluate(() => { const n = document.querySelector('[data-testid="stats-other-side"]'); return n ? n.textContent : null; });
    await page.screenshot({ path: path.join(OUT, `note_${vp.name}.png`) });
    await page.click('[data-testid="stats-view-other-side"]'); await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ player: !!document.querySelector('[data-section="best"]'), note: document.querySelector('[data-testid="stats-other-side"]')?.textContent || null, sw: document.scrollingElement.scrollWidth }));
    out[vp.name] = { note, after };
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
