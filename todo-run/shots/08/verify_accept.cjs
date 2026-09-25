// Verifier (acceptance lens) for item 08. Independent of check.cjs.
// 1. Live 200 video playlist (one YouTube walk; osu search stubbed in page, zero osu! calls).
// 2. Stubbed /api/playlist: truncated false (250 length, 246 loaded) => no popup; truncated true => popup, desktop + phone.
// 3. 500 row Search All in fake time against an in-page 60/min fixed window stub, desktop + phone.
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const OUT = __dirname;
const BASE = 'http://localhost:3000';
const LIVE = 'https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj';
const kill = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 420000);
const VIEWS = { desktop: { width: 1280, height: 800 }, phone: { width: 375, height: 812 } };

// In-page stub for /api/osu/search: a fixed 60 s window, 60 allowed, 429 + Retry-After past that.
const SEARCH_STUB = () => {
  const realFetch = window.fetch.bind(window);
  window.__calls = []; window.__429 = 0;
  const win = { start: 0, n: 0 };
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.includes('/api/osu/search')) return realFetch(input, init);
    const t = Date.now();
    window.__calls.push(t);
    const ws = Math.floor(t / 60000) * 60000;
    if (ws !== win.start) { win.start = ws; win.n = 0; }
    win.n++;
    if (win.n > 60) {
      window.__429++;
      const ra = Math.ceil((ws + 60000 - t) / 1000);
      return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { 'Retry-After': String(ra), 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: true, beatmapsets: [], rejection: 'no-match' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
};

async function load(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 30000 });
  await page.waitForTimeout(900);
}
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const dialogCount = (p) => p.getByText(/osu!Sync (loads|could only load) the first/).count();

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const R = { live: {}, popup: {}, pacing: {} };

  // ---- 1. live ----
  {
    const ctx = await browser.newContext({ viewport: VIEWS.desktop });
    await ctx.addInitScript(SEARCH_STUB);
    const page = await ctx.newPage();
    let data = null, ms = 0;
    page.on('response', async (res) => { if (res.url().includes('/api/playlist')) { try { data = await res.json(); } catch {} } });
    await load(page);
    await page.fill('#playlist-url-input', LIVE);
    const t0 = Date.now();
    await page.press('#playlist-url-input', 'Enter');
    await page.waitForSelector('[id^="checkbox-song-"]', { state: 'attached', timeout: 60000 });
    ms = Date.now() - t0;
    await page.waitForTimeout(3000);
    R.live = {
      ms, returnedCount: data?.returnedCount, loadedCount: data?.loadedCount, unavailableCount: data?.unavailableCount,
      truncated: data?.truncated, playlistLength: data?.playlistLength, loadCap: data?.loadCap, songs: data?.songs?.length,
      positions: data?.songs ? [data.songs[0]?.position, data.songs.at(-1)?.position] : null,
      dialog: await dialogCount(page),
      header: await page.getByText(/Showing \d+ of \d+ songs/).first().innerText().catch(() => null),
      osuCalls: await page.evaluate(() => window.__calls.length),
    };
    await page.screenshot({ path: path.join(OUT, 'v_desktop_live200.png') });
    fs.writeFileSync(path.join(OUT, 'v_live_playlist.json'), JSON.stringify(data));
    await ctx.close();
    R._template = data;
  }
  const tpl = R._template; delete R._template;
  const mkSongs = (n) => Array.from({ length: n }, (_, i) => {
    const s = tpl.songs[i % tpl.songs.length];
    return { ...s, id: `stub${String(i).padStart(7, '0')}`, title: `${s.title} ${i}`, position: i };
  });

  // ---- 2. popup ----
  const cases = {
    notTruncated250: { truncated: false, playlistLength: 250, loadedCount: 250, unavailableCount: 4, loadCap: 500, n: 246 },
    truncated800: { truncated: true, playlistLength: 800, loadedCount: 500, unavailableCount: 0, loadCap: 500, n: 500 },
    truncatedNoLen: { truncated: true, playlistLength: null, loadedCount: 500, unavailableCount: 0, loadCap: 500, n: 500 },
  };
  for (const [dev, vp] of Object.entries(VIEWS)) {
    for (const [label, c] of Object.entries(cases)) {
      const ctx = await browser.newContext({ viewport: vp });
      await ctx.addInitScript(SEARCH_STUB);
      const p = await ctx.newPage();
      const songs = mkSongs(c.n);
      await p.route('**/api/playlist**', (route) => route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...tpl, songs, totalSongs: c.n, returnedCount: c.n, loadedCount: c.loadedCount, unavailableCount: c.unavailableCount, truncated: c.truncated, playlistLength: c.playlistLength, loadCap: c.loadCap }) }));
      await load(p);
      await p.fill('#playlist-url-input', LIVE);
      await p.press('#playlist-url-input', 'Enter');
      await p.waitForSelector('[id^="checkbox-song-"]', { state: 'attached', timeout: 30000 });
      await p.waitForTimeout(1500);
      const n = await dialogCount(p);
      const text = n ? (await p.getByText(/osu!Sync (loads|could only load) the first/).first().innerText()).trim() : null;
      R.popup[`${dev}_${label}`] = { dialog: n, text, dash: text ? /[-–—]/.test(text.replace(/osu!Sync/g, '')) : null, noHScroll: await noHScroll(p),
        header: await p.getByText(/Showing \d+ of \d+ songs/).first().innerText().catch(() => null) };
      await p.screenshot({ path: path.join(OUT, `v_${dev}_popup_${label}.png`) });
      await ctx.close();
    }
  }

  // ---- 3. pacing: 500 rows, fake clock ----
  for (const [dev, vp] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript(SEARCH_STUB);
    const p = await ctx.newPage();
    const songs = mkSongs(500);
    await p.route('**/api/playlist**', (route) => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...tpl, songs, totalSongs: 500, returnedCount: 500, loadedCount: 500, unavailableCount: 0, truncated: false, playlistLength: 500, loadCap: 500 }) }));
    await load(p);
    await p.clock.install();
    await p.fill('#playlist-url-input', LIVE);
    await p.press('#playlist-url-input', 'Enter');
    await p.waitForSelector('[id^="checkbox-song-"]', { state: 'attached', timeout: 30000 });
    await p.clock.runFor(3000);
    await p.getByRole('button', { name: /Search All/ }).first().click();
    const out = { snapshots: [] };
    for (let min = 1; min <= 11; min++) {
      for (let k = 0; k < 12; k++) await p.clock.runFor(5000);
      const s = await p.evaluate(() => ({ calls: window.__calls.length, r429: window.__429 }));
      out.snapshots.push(s);
      if (min === 2) await p.screenshot({ path: path.join(OUT, `v_${dev}_searchall_progress.png`) });
      if (s.calls >= 500 && min > 1) {
        const busyNow = await p.getByText('osu! is busy').count();
        const searchAllLeft = await p.getByRole('button', { name: /Search All/ }).count();
        if (searchAllLeft === 0) break;
      }
    }
    const calls = await p.evaluate(() => window.__calls);
    let maxWin = 0;
    for (let i = 0; i < calls.length; i++) { let j = i; while (j < calls.length && calls[j] - calls[i] < 60000) j++; maxWin = Math.max(maxWin, j - i); }
    // show every row and count busy rows
    const allBtn = p.locator('#page-size-all');
    if (await allBtn.count()) { await allBtn.first().click(); await p.clock.runFor(2000); }
    out.totalCalls = calls.length; out.max60sWindow = maxWin;
    out.r429 = await p.evaluate(() => window.__429);
    out.busyRows = await p.getByText('osu! is busy').count();
    out.failedRows = await p.getByText('The search failed').count();
    out.searchAllButtonLeft = await p.getByRole('button', { name: /Search All/ }).count();
    out.spanMin = calls.length ? ((calls.at(-1) - calls[0]) / 60000).toFixed(2) : null;
    await p.screenshot({ path: path.join(OUT, `v_${dev}_searchall_done.png`) });
    R.pacing[dev] = out;
    await ctx.close();
  }

  console.log(JSON.stringify(R, null, 2));
  await browser.close();
  clearTimeout(kill);
})().catch((e) => { console.error(e); process.exit(1); });
