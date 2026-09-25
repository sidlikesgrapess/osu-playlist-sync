// A 429 (Retry-After 3) on the first two /api/osu/search calls: rows retry, none ends as "osu! is busy". Desktop + phone.
const { chromium } = require('playwright'); const path = require('node:path'); const fs = require('node:fs');
const kill = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 120000);
const tpl = JSON.parse(fs.readFileSync(path.join(__dirname, 'v_live_playlist.json'), 'utf8'));
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const R = {};
  for (const [dev, vp] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 375, height: 812 }]]) {
    const ctx = await browser.newContext({ viewport: vp }); const p = await ctx.newPage();
    const log = []; let n = 0;
    await p.route('**/api/playlist**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...tpl, songs: tpl.songs.slice(0, 10), returnedCount: 10, totalSongs: 10, loadedCount: 10, playlistLength: 10 }) }));
    await p.route('**/api/osu/search**', (r) => { n++; log.push({ t: Date.now(), status: n <= 2 ? 429 : 200 });
      if (n <= 2) return r.fulfill({ status: 429, headers: { 'Retry-After': '3', 'Content-Type': 'application/json' }, body: '{"error":"Too many requests"}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"beatmapsets":[],"rejection":"no-match"}' }); });
    await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#playlist-url-input'); await p.waitForTimeout(800);
    await p.fill('#playlist-url-input', 'https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj'); await p.press('#playlist-url-input', 'Enter');
    await p.waitForTimeout(1500); const busyMid = await p.getByText('osu! is busy').count();
    await p.waitForTimeout(8000);
    R[dev] = { calls: log.length, statuses: log.map((x) => x.status), rel: log.map((x) => x.t - log[0].t), busyMid, busyEnd: await p.getByText('osu! is busy').count() };
    await p.screenshot({ path: path.join(__dirname, `v_${dev}_retry_done.png`) }); await ctx.close();
  }
  console.log(JSON.stringify(R)); await browser.close(); clearTimeout(kill);
})().catch((e) => { console.error(e); process.exit(1); });
