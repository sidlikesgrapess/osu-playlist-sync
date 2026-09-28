// Item 13 (F-46) UI check on the running dev server. /api/playlist runs for real (a typed
// query, no upstream call); /api/osu/search is intercepted and answered with a stub, so this
// makes no osu! API call at all. Checks the altTitle param page.js sends and that the row
// renders, at desktop 1280x800 and phone 375x812.
// Run: NODE_PATH="$(npm root -g)" node todo-run/shots/13/verify.cjs
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';

const CASES = [
  { key: 'remix', q: 'COOL&CREATE - Night of Nights (Flowering nights remix)', wantTitle: 'Night of Nights', wantAlt: 'Night of Nights (Flowering nights remix)', set: { id: 900001, title: 'Night of Nights (Flowering nights remix)', artist: 'COOL&CREATE' } },
  { key: 'plain', q: 'Kenshi Yonezu - Lemon', wantTitle: 'Lemon', wantAlt: null, set: { id: 900002, title: 'Lemon', artist: 'Kenshi Yonezu' } },
];
const stubSet = (s) => ({
  id: s.id, title: s.title, titleUnicode: s.title, artist: s.artist, artistUnicode: s.artist, creator: 'stub', creatorId: 1,
  status: 'ranked', bpm: 180, covers: { cover: '', list: '', card: '' }, playCount: 1000, favouriteCount: 10, matchScore: 220,
  difficulties: [{ id: s.id * 10, difficultyRating: 4.2, version: 'Insane', mode: 'osu', bpm: 180, totalLength: 200 }],
  beatmaps: [{ id: s.id * 10, difficultyRating: 4.2, version: 'Insane', mode: 'osu', bpm: 180, totalLength: 200 }],
});

(async () => {
  const hard = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 180000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const R = { checks: {}, log: [], searches: [] };
  const ok = (k, v, d) => { R.checks[k] = { pass: !!v, detail: d }; };
  try {
    for (const [vpName, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 375, height: 812 }]]) {
      for (const c of CASES) {
        const ctx = await browser.newContext({ viewport });
        const page = await ctx.newPage();
        page.on('console', (m) => { if (m.type() === 'error') R.log.push(`${vpName}/${c.key} ${m.text()}`); });
        page.on('pageerror', (e) => R.log.push(`${vpName}/${c.key} pageerror ${e.message}`));
        const seen = [];
        await page.route('**/api/osu/search?**', (route) => {
          const u = new URL(route.request().url());
          seen.push(Object.fromEntries(u.searchParams));
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, query: u.searchParams.get('q'), total: 1, bestScore: 220, beatmapsets: [stubSet(c.set)], isDemo: false, rejection: null, artistConfidence: 'high' }) });
        });
        await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector('#playlist-url-input', { timeout: 60000 });
        await page.waitForTimeout(900);
        await page.fill('#playlist-url-input', c.q);
        await page.press('#playlist-url-input', 'Enter');
        await page.waitForFunction((t) => document.body.innerText.includes(t), c.set.title, { timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(800);
        const p = seen[0] || {};
        R.searches.push({ vp: vpName, case: c.key, params: p });
        ok(`${vpName}/${c.key}: search sent`, seen.length >= 1, seen.length);
        ok(`${vpName}/${c.key}: title param`, p.title === c.wantTitle, p.title);
        ok(`${vpName}/${c.key}: altTitle param`, (p.altTitle ?? null) === c.wantAlt, p.altTitle ?? null);
        const shown = await page.evaluate((t) => document.body.innerText.includes(t), c.set.title);
        ok(`${vpName}/${c.key}: matched row rendered`, shown, c.set.title);
        const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        ok(`${vpName}/${c.key}: no horizontal scroll`, sw[0] <= sw[1], sw);
        await page.screenshot({ path: path.join(OUT, `${vpName}_${c.key}.png`), fullPage: false });
        await ctx.close();
      }
    }
  } catch (e) { R.log.push('fatal ' + e.message); }
  await browser.close();
  clearTimeout(hard);
  const failed = Object.entries(R.checks).filter(([, v]) => !v.pass);
  R.summary = { total: Object.keys(R.checks).length, failed: failed.length, errors: R.log.length };
  fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R.summary), failed.map(([k, v]) => `${k}: ${JSON.stringify(v.detail)}`).join('\n'));
  console.log(R.log.join('\n'));
})();
