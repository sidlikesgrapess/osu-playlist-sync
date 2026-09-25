// Verifier (acceptance lens) for item 02. Stubbed playlist + search, no osu! API traffic.
const { chromium } = require('playwright');
const path = require('path');
const OUT = __dirname;
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(2); }, 150000);

const set = (id, t, extra = {}) => ({
  id, title: t, title_unicode: t, artist: 'Artist ' + t, artist_unicode: 'Artist ' + t, creator: 'mapper',
  status: 'ranked', covers: {}, beatmaps: [{ id: id * 10, version: 'Hard', difficulty_rating: 4, mode: 'osu' }],
  matchScore: extra.artistOverride || extra.titleOnly ? null : 200, ...extra,
});
let scenario = 1;
const S1 = { Alpha: [set(1, 'Alpha')], Bravo: [set(2, 'Bravo', { artistOverride: true })], Charlie: [set(3, 'Charlie', { titleOnly: true })], Delta: [], Echo: [set(5, 'Echo')] };
const S2 = { Foxtrot: [set(6, 'Foxtrot', { artistOverride: true })], Golf: [set(7, 'Golf', { titleOnly: true })] };
const titlesOf = () => Object.keys(scenario === 1 ? S1 : S2);

const errors = [], fails = [];
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const DASH = /[-–—]/;

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.route('**/api/playlist*', r => r.fulfill({ json: {
    songs: titlesOf().map((t, i) => ({ id: 's' + scenario + '_' + i, title: t, channelTitle: 'Artist ' + t, source: 'youtube', cleanQuery: t, extractedTitle: t })),
    playlistTitle: 'stub', platform: 'youtube', returnedCount: titlesOf().length, loadedCount: titlesOf().length,
  } }));
  await page.route('**/api/osu/search*', r => {
    const u = decodeURIComponent(r.request().url());
    const map = scenario === 1 ? S1 : S2;
    const t = Object.keys(map).find(x => u.includes(x));
    r.fulfill({ json: { success: true, beatmapsets: map[t] || [] } });
  });
  await page.route(/assets\.ppy\.sh|b\.ppy\.sh/, r => r.abort());

  const btn = page.locator('#select-confirmed-button');
  const counter = () => page.evaluate(() => (document.body.innerText.match(/\d+ of \d+ selected/) || ['none'])[0]);
  const label = async () => (await btn.textContent()).trim();
  const ticks = (prefix) => page.$$eval(`[id^="${prefix}"]`, els => els.filter(e => e.offsetParent !== null).map(e => e.id.replace(/.*song-/, '') + '=' + (getComputedStyle(e).backgroundColor === 'rgb(255, 102, 170)' ? 1 : 0)).join(','));
  const click = async (sel) => { await page.click(sel); await page.waitForTimeout(250); };
  const press = async () => { await btn.click(); await page.waitForTimeout(250); };
  const load = async (n) => {
    await page.fill('#playlist-url-input', 'https://www.youtube.com/playlist?list=PLstub' + scenario);
    await page.press('#playlist-url-input', 'Enter');
    await page.waitForFunction((n) => new RegExp('\\d+ of ' + n + ' selected').test(document.body.innerText), n, { timeout: 30000 });
    await page.waitForTimeout(1500);
  };

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await load(4); // matched A,B,C,E; confirmed A,E

  // desktop
  check(!(await page.content()).includes('Select All Matched'), 'D: old label absent');
  check(await page.locator('#select-all-header-checkbox').isVisible(), 'D: header checkbox visible');
  console.log('D loaded:', await counter(), '|', await label(), '|', await ticks('checkbox-song-'));
  if ((await label()) === 'Deselect All') await press();
  check((await counter()) === '0 of 4 selected', 'D: cleared ' + await counter());
  check((await label()) === 'Select Confirmed (2)', 'D: label ' + await label());
  check(!DASH.test(await label()), 'D: no dash in label');
  check(!DASH.test(await btn.getAttribute('title')), 'D: no dash in tooltip: ' + await btn.getAttribute('title'));
  await page.screenshot({ path: path.join(OUT, 'v_desktop_1_empty.png') });

  await click('#select-all-header-checkbox');
  check((await counter()) === '4 of 4 selected', 'D: header selects all matched ' + await counter());
  check((await label()) === 'Select Confirmed (2)', 'D: label after header ' + await label());
  await page.screenshot({ path: path.join(OUT, 'v_desktop_2_header.png') });

  await press();
  check((await counter()) === '2 of 4 selected', 'D: confirmed only ' + await counter());
  const t = await ticks('checkbox-song-');
  console.log('D ticks after confirmed:', t);
  check(t === 's1_0=1,s1_1=0,s1_2=0,s1_3=0,s1_4=1', 'D: only A and E ticked');
  check((await label()) === 'Deselect All', 'D: reads Deselect All ' + await label());
  await page.screenshot({ path: path.join(OUT, 'v_desktop_3_confirmed.png') });
  await press();
  check((await counter()) === '0 of 4 selected', 'D: deselect all ' + await counter());

  await click('#checkbox-song-s1_0');
  check((await label()) === 'Select Confirmed (2)', 'D: partial selection label ' + await label());
  await press();
  check((await counter()) === '2 of 4 selected', 'D: partial then confirmed ' + await counter());
  await press();
  await click('#checkbox-song-s1_1');
  check((await label()) === 'Select Confirmed (2)', 'D: flagged only tick label ' + await label());
  await press();
  check((await ticks('checkbox-song-')) === 's1_0=1,s1_1=0,s1_2=0,s1_3=0,s1_4=1', 'D: flagged row dropped by preset');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'D: no horizontal scroll');

  // phone
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(700);
  check(!(await page.locator('#select-all-header-checkbox').isVisible()), 'P: header checkbox hidden on phone');
  check(await btn.isVisible(), 'P: button visible');
  console.log('P state:', await counter(), '|', await label(), '|', await ticks('checkbox-mobile-song-'));
  check((await label()) === 'Deselect All', 'P: label with confirmed set selected ' + await label());
  await page.screenshot({ path: path.join(OUT, 'v_phone_1_confirmed.png') });
  await press();
  check((await counter()) === '0 of 4 selected', 'P: deselect ' + await counter());
  check((await label()) === 'Select Confirmed (2)', 'P: label ' + await label());
  await page.screenshot({ path: path.join(OUT, 'v_phone_2_empty.png') });
  await click('#checkbox-mobile-song-s1_1'); await click('#checkbox-mobile-song-s1_2');
  check((await counter()) === '2 of 4 selected', 'P: manual flagged ticks ' + await counter());
  await press();
  const tp = await ticks('checkbox-mobile-song-');
  console.log('P ticks after confirmed:', tp);
  check(tp === 's1_0=1,s1_1=0,s1_2=0,s1_3=0,s1_4=1', 'P: only A and E ticked on cards');
  check((await label()) === 'Deselect All', 'P: reads Deselect All');
  await page.screenshot({ path: path.join(OUT, 'v_phone_3_confirmed.png') });
  const bb = await btn.boundingBox();
  check(bb && bb.x >= 0 && bb.x + bb.width <= 375, 'P: button within viewport ' + JSON.stringify(bb));
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'P: no horizontal scroll');

  // zero confirmed
  scenario = 2;
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await load(2);
  console.log('Z loaded:', await counter(), '|', await label(), '| disabled=', await btn.isDisabled());
  check((await counter()) === '0 of 2 selected', 'Z: nothing auto selected ' + await counter());
  check((await label()) === 'Select Confirmed (0)' && await btn.isDisabled(), 'Z: disabled with (0)');
  await page.screenshot({ path: path.join(OUT, 'v_phone_4_zero.png') });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(600);
  check(await btn.isDisabled(), 'Z: disabled on desktop too');
  await btn.click({ force: true }); await page.waitForTimeout(250);
  check((await counter()) === '0 of 2 selected', 'Z: forced click does nothing ' + await counter());
  await page.screenshot({ path: path.join(OUT, 'v_desktop_4_zero.png') });
  await click('#select-all-header-checkbox');
  check((await counter()) === '2 of 2 selected', 'Z: header still selects flagged ' + await counter());
  check((await label()) === 'Deselect All' && !(await btn.isDisabled()), 'Z: deselect available ' + await label());
  await press();
  check((await counter()) === '0 of 2 selected', 'Z: deselect cleared ' + await counter());

  check(errors.length === 0, 'no console/page errors: ' + JSON.stringify(errors));
  await browser.close();
  console.log(fails.length ? `FAILED ${fails.length}: ` + JSON.stringify(fails) : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('ERR', e); process.exit(3); });
