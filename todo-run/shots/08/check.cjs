// Item 08 sanity check against the dev server on :3000.
// A. Live 200 video playlist: walked in full (loadedCount 200, truncated false), no popup.
//    /api/osu/search is stubbed so no osu! call is made; its first answer is a 429 so the
//    paced retry is visible, then Search All shows the pacer holding at 55 per minute.
// B. /api/playlist stubbed as truncated: the popup at 1280x800 and 375x812.
const { chromium } = require('playwright');
const path = require('node:path');

const OUT = __dirname;
const BASE = 'http://localhost:3000';
const LIVE = 'https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj';
const kill = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 240000);

async function load(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 30000 });
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const result = { A: {}, B: {} };

  // ---- A ----
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctxA.newPage();
  const searches = [];
  let first429 = true;
  await page.route('**/api/osu/search**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q');
    searches.push({ t: Date.now(), q });
    if (first429) {
      first429 = false;
      return route.fulfill({ status: 429, headers: { 'Retry-After': '2', 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Too many requests' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, beatmapsets: [], rejection: 'no-match' }) });
  });
  let liveData = null;
  page.on('response', async (res) => {
    if (res.url().includes('/api/playlist')) { try { liveData = await res.json(); } catch {} }
  });
  await load(page);
  await page.fill('#playlist-url-input', LIVE);
  const t0 = Date.now();
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForSelector('[id^="checkbox-song-"]', { timeout: 60000 });
  result.A.playlistMs = Date.now() - t0;
  await page.waitForTimeout(5000);
  result.A.api = liveData && {
    returnedCount: liveData.returnedCount, loadedCount: liveData.loadedCount, unavailableCount: liveData.unavailableCount,
    truncated: liveData.truncated, playlistLength: liveData.playlistLength, loadCap: liveData.loadCap, songs: liveData.songs?.length,
  };
  result.A.dialogShown = await page.getByText(/osu!Sync (loads|could only load) the first/).count();
  const firstQ = searches[0]?.q;
  result.A.firstQueryRetried = searches.filter((s) => s.q === firstQ).length;
  result.A.rateLimitedRows = await page.getByText(/busy/i).count();
  result.A.autoSearches = searches.length;
  await page.screenshot({ path: path.join(OUT, 'desktop_live_200.png') });

  // Search All: every request is stubbed, so this shows the pacer, not osu!.
  const btn = page.getByRole('button', { name: /Search All/ });
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForTimeout(10000);
    const start = searches[0].t;
    result.A.searchesIn10sAfterSearchAll = searches.length;
    result.A.maxInFirstMinute = searches.filter((s) => s.t - start < 60000).length;
    result.A.rateLimitedRowsAfter = await page.getByText(/busy/i).count();
  } else {
    result.A.searchAll = 'button not found';
  }
  await ctxA.close();

  // ---- B ----
  for (const [device, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 375, height: 812 }]]) {
    for (const [label, playlistLength] of [['800', 800], ['nolength', null]]) {
      const ctx = await browser.newContext({ viewport });
      const p = await ctx.newPage();
      await p.route('**/api/osu/search**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, beatmapsets: [], rejection: 'no-match' }) }));
      await p.route('**/api/playlist**', (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...liveData, truncated: true, playlistLength, loadedCount: 500, returnedCount: liveData.songs.length, loadCap: 500 }),
      }));
      await load(p);
      await p.fill('#playlist-url-input', LIVE);
      await p.press('#playlist-url-input', 'Enter');
      const msg = p.getByText(/osu!Sync loads the first 500\./).first();
      await msg.waitFor({ timeout: 30000 });
      const key = `${device}_${label}`;
      result.B[key] = {
        text: (await msg.innerText()).trim(),
        noHScroll: await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      };
      await p.waitForTimeout(400);
      await p.screenshot({ path: path.join(OUT, `${device}_truncated_${label}.png`) });
      await p.getByRole('button', { name: /^OK$/ }).click();
      await p.waitForTimeout(300);
      result.B[key].closedByOk = (await p.getByText(/osu!Sync loads the first 500\./).count()) === 0;
      await ctx.close();
    }
  }

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  clearTimeout(kill);
})().catch((e) => { console.error(e); process.exit(1); });
