// Item 02 live check: stubbed playlist + search, no osu! API calls.
// Covers are aborted on purpose (no ppy.sh traffic), so their 'Failed to load resource' console lines are ignored.
const { chromium } = require('playwright');
const path = require('path');
const OUT = __dirname;
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(2); }, 90000);

const titles = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
const set = (id, t, extra = {}) => ({
  id, title: t, title_unicode: t, artist: 'Artist ' + t, artist_unicode: 'Artist ' + t, creator: 'mapper',
  status: 'ranked', covers: {}, beatmaps: [{ id: id * 10, version: 'Hard', difficulty_rating: 4, mode: 'osu' }],
  matchScore: extra.artistOverride || extra.titleOnly ? null : 200, ...extra,
});
const searchFor = {
  Alpha: [set(1, 'Alpha')],
  Bravo: [set(2, 'Bravo', { artistOverride: true })],
  Charlie: [set(3, 'Charlie', { titleOnly: true })],
  Delta: [],
};

const errors = [];
const fails = [];
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails.push(msg); };

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.route('**/api/playlist*', r => r.fulfill({ json: {
    songs: titles.map((t, i) => ({ id: 'yt' + i, title: t, channelTitle: 'Artist ' + t, source: 'youtube', cleanQuery: t, extractedTitle: t })),
    playlistTitle: 'stub', platform: 'youtube', returnedCount: 4, loadedCount: 4,
  } }));
  await page.route('**/api/osu/search*', r => {
    const u = decodeURIComponent(r.request().url());
    const t = titles.find(x => u.includes(x));
    r.fulfill({ json: { success: true, beatmapsets: searchFor[t] || [] } });
  });
  await page.route(/assets\.ppy\.sh|b\.ppy\.sh/, r => r.abort());

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('#playlist-url-input', 'https://www.youtube.com/playlist?list=PLstubstubstub');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForSelector('#select-all-header-checkbox', { timeout: 30000 });
  await page.waitForFunction(() => /\d+ of 3 selected/.test(document.body.innerText), null, { timeout: 30000 });
  await page.waitForTimeout(600);

  const btn = page.locator('#select-confirmed-button');
  const counter = async () => page.evaluate(() => (document.body.innerText.match(/\d+ of \d+ selected/) || ['none'])[0]);
  const label = async () => (await btn.textContent()).trim();

  const run = async (prefix, useHeader) => {
    check(!(await page.content()).includes('Select All Matched'), `${prefix}: old label gone`);
    check(await btn.isVisible(), `${prefix}: button visible`);
    // after load the auto-select already equals the confirmed set
    if ((await counter()).startsWith('1 of')) {
      check((await label()) === 'Deselect All', `${prefix}: loaded state reads Deselect All (${await label()})`);
      await btn.click(); await page.waitForTimeout(200);
    }
    check((await counter()) === '0 of 3 selected', `${prefix}: cleared (${await counter()})`);
    check((await label()) === 'Select Confirmed (1)', `${prefix}: label Select Confirmed (1) (${await label()})`);
    check(!/[-–—]/.test(await label()), `${prefix}: no dash in label`);
    await page.screenshot({ path: path.join(OUT, `${prefix}_1_empty.png`), fullPage: true });
    if (useHeader) {
      await page.click('#select-all-header-checkbox'); await page.waitForTimeout(200);
      check((await counter()) === '3 of 3 selected', `${prefix}: header selects every match (${await counter()})`);
      check((await label()) === 'Select Confirmed (1)', `${prefix}: label stays after header (${await label()})`);
      await page.screenshot({ path: path.join(OUT, `${prefix}_2_header_all.png`), fullPage: true });
    }
    await btn.click(); await page.waitForTimeout(200);
    check((await counter()) === '1 of 3 selected', `${prefix}: confirmed only (${await counter()})`);
    const states = await page.$$eval('[id^="checkbox-song-"]', els => els.filter(e => e.offsetParent !== null).map(e => e.id + ':' + (getComputedStyle(e).backgroundColor === 'rgb(255, 102, 170)')));
    console.log(`${prefix}: visible checkbox states`, JSON.stringify(states));
    check((await label()) === 'Deselect All', `${prefix}: now reads Deselect All`);
    await page.screenshot({ path: path.join(OUT, `${prefix}_3_confirmed.png`), fullPage: true });
    await btn.click(); await page.waitForTimeout(200);
    check((await counter()) === '0 of 3 selected', `${prefix}: deselect all (${await counter()})`);
    const sc = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    check(sc, `${prefix}: no horizontal scroll`);
  };

  await run('desktop', true);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await run('phone', false);

  check(errors.length === 0, 'no console errors: ' + JSON.stringify(errors));
  await browser.close();
  console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('ERR', e); process.exit(3); });
