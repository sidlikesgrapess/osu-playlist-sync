// Item 11 sanity check: avatars are lazy, and the request count is what it was.
// Every external call is stubbed (osu! player, beatmaps, images), so nothing leaves the machine.
// Run: NODE_PATH="$(npm root -g)" node todo-run/shots/11/verify.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(OUT, '..', '03', 'search-cache.json'), 'utf8')).beatmapsets[0];
// A real 2x2 PNG so naturalWidth is measurable.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8DwnwEJMOFSAAAoWQME5UtR+wAAAABJRU5ErkJggg==', 'base64');
const mkSet = (id, title) => ({ ...TEMPLATE, id, title, titleUnicode: title, artistOverride: false, titleOnly: false,
  covers: Object.fromEntries(Object.keys(TEMPLATE.covers).map((k) => [k, `https://assets.ppy.sh/beatmaps/${id}/covers/${k}.jpg`])) });
const mkUser = (id, username) => ({ id, username, avatarUrl: `https://a.ppy.sh/${id}`, countryCode: 'JP', coverUrl: null, globalRank: id, countryRank: 1, pp: 1000, playCount: 10, counts: { best: 100, most_played: 100, favourite: 100 } });
const USERS = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [2000 + i, mkUser(2000 + i, `player${i}`)]));

async function run(browser, name, viewport) {
  const R = { name, checks: {} }; const log = []; const leaked = [];
  const calls = { q: 0, userId: 0, beatmaps: 0, other: 0 };
  const ok = (k, v, detail) => { R.checks[k] = { pass: !!v, ...(detail === undefined ? {} : { detail }) }; };
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') log.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  await ctx.route('**/*', async (r) => {
    const u = r.request().url();
    const json = (body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.includes('/api/osu/player/beatmaps')) {
      calls.beatmaps += 1;
      const type = new URL(u).searchParams.get('type') || 'best';
      const items = Array.from({ length: 100 }, (_, i) => ({ beatmapset: mkSet(700000 + i + type.length * 1000, `${type} Set ${i}`), meta: { pp: 500, rank: 'S', accuracy: 99, mods: [], playcount: 5 } }));
      return json({ type, items, fetched: 100, total: 100 });
    }
    if (u.includes('/api/osu/player')) {
      const sp = new URL(u).searchParams;
      if (sp.get('userId')) { calls.userId += 1; return json({ type: 'profile', user: USERS[sp.get('userId')] }); }
      calls.q += 1;
      return json({ type: 'results', users: Object.values(USERS), total: 20, page: 1 });
    }
    if (u.includes('/api/osu/')) calls.other += 1;
    if (u.includes('ppy.sh')) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.includes('fonts.g')) leaked.push(u);
    return r.continue();
  });

  const text = () => page.evaluate(() => document.body.innerText);
  const clickText = (re) => page.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && r.test(e.innerText.trim())); if (!b) throw new Error('no button ' + src); b.click(); }, re);
  const clickSel = (sel) => page.evaluate((s) => { const b = [...document.querySelectorAll(s)].find((e) => e.offsetParent !== null); if (!b) throw new Error('no ' + s); b.click(); }, sel);
  const settle = (ms = 500) => page.waitForTimeout(ms);
  const waitText = (s) => page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), s, { timeout: 20000 });
  const AV = 'img[src^="https://a.ppy.sh/"]';
  const avatars = () => page.evaluate((s) => [...document.querySelectorAll(s)].map((i) => ({ loading: i.getAttribute('loading'), decoding: i.getAttribute('decoding'), nw: i.naturalWidth })), AV);

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 30000 });
  await settle(800);

  // a. Name search: one call, every result avatar lazy and async, and they render once in view.
  await clickSel('#search-mode-player-btn'); await settle();
  await page.fill('#playlist-url-input', 'player'); await page.press('#playlist-url-input', 'Enter');
  await waitText('player19'); await settle(800);
  const listAv = await avatars();
  ok('a_results_avatars_lazy_async', listAv.length === 20 && listAv.every((a) => a.loading === 'lazy' && a.decoding === 'async'), { n: listAv.length, first: listAv[0] });
  await page.screenshot({ path: path.join(OUT, `${name}_1_results.png`) });
  await page.evaluate((s) => { const all = document.querySelectorAll(s); all[all.length - 1].scrollIntoView(); }, AV); await settle(800);
  const listAv2 = await avatars();
  ok('a_results_avatars_render', listAv2.every((a) => a.nw > 0), listAv2.map((a) => a.nw));
  ok('a_one_search_call', calls.q === 1, { ...calls });

  // b. Pick a player: one profile call plus the best section.
  await clickText('^player0'); await waitText('best Set 0'); await settle(800);
  ok('b_pick_calls', calls.userId === 1 && calls.beatmaps === 1, { ...calls });

  // c. Open one more section: one more call.
  await clickText('Most Played'); await waitText('most_played Set 0'); await settle(800);
  ok('c_section_call', calls.beatmaps === 2, { ...calls });

  // d. Show more reveals rows from memory: no call.
  const before = { ...calls };
  await clickText('^Show more'); await settle(800);
  ok('d_show_more_no_calls', JSON.stringify(calls) === JSON.stringify(before), { ...calls });
  const t = await text();
  ok('d_rows_revealed', t.includes('best Set 49') || t.includes('most_played Set 49'));

  // e. Change Player: the Back to chip avatar is lazy and async and renders.
  await clickText('^Change Player$'); await settle(600);
  await waitText('Back to player0');
  const chip = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => /^Back to player0/.test(e.innerText.trim())); const i = b && b.querySelector('img'); if (b) b.scrollIntoView(); return i && { loading: i.getAttribute('loading'), decoding: i.getAttribute('decoding') }; });
  await settle(800);
  const chipNw = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => /^Back to player0/.test(e.innerText.trim())); return b.querySelector('img').naturalWidth; });
  ok('e_chip_lazy_async', chip && chip.loading === 'lazy' && chip.decoding === 'async', chip);
  ok('e_chip_renders', chipNw > 0, chipNw);
  ok('e_change_player_no_calls', JSON.stringify(calls) === JSON.stringify(before), { ...calls });
  await page.screenshot({ path: path.join(OUT, `${name}_2_back_chip.png`) });

  ok('z_total_calls', calls.q === 1 && calls.userId === 1 && calls.beatmaps === 2 && calls.other === 0, calls);
  ok('z_no_console_errors', log.length === 0, log);
  ok('z_no_leaks', leaked.length === 0, leaked);
  R.calls = calls;
  await ctx.close();
  return R;
}

(async () => {
  const hard = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 180000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const results = [];
  try {
    results.push(await run(browser, 'desktop', { width: 1280, height: 800 }));
    results.push(await run(browser, 'phone', { width: 375, height: 812 }));
  } catch (e) { results.push({ error: String((e && e.stack) || e) }); }
  await browser.close(); clearTimeout(hard);
  fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2));
  const fails = results.flatMap((r) => (r.error ? [r.error] : Object.entries(r.checks).filter(([, v]) => !v.pass).map(([k, v]) => `${r.name}.${k} ${JSON.stringify(v.detail)}`)));
  console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'ALL PASS');
  console.log(JSON.stringify(results.map((r) => ({ name: r.name, calls: r.calls, checks: r.checks && Object.keys(r.checks).length }))));
})();
