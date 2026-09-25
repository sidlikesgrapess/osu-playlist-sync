// Verifier supplement for item 10: paged pick, section open state, trash from the list view. Stubbed.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(OUT, '..', '03', 'search-cache.json'), 'utf8')).beatmapsets[0];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const mkSet = (id, title) => ({ ...TEMPLATE, id, title, titleUnicode: title, artistOverride: false, titleOnly: false,
  previewUrl: `https://b.ppy.sh/preview/${id}.mp3`,
  covers: Object.fromEntries(Object.keys(TEMPLATE.covers).map((k) => [k, `https://assets.ppy.sh/beatmaps/${id}/covers/${k}.jpg`])) });
const mkUser = (id, username) => ({ id, username, avatarUrl: `https://a.ppy.sh/${id}`, countryCode: 'JP', coverUrl: null, globalRank: id, countryRank: 1, pp: 1000, playCount: 10, counts: { best: 6, most_played: 6, favourite: 6 } });
const NAMES = ['userA', 'userB', 'userC'];
const userFor = (id) => { const pg = Math.floor((id - 1001) / 10); const i = (id - 1001) % 10; return mkUser(id, NAMES[i] + (pg > 1 ? `p${pg}` : '')); };

async function run(browser, name, viewport) {
  const R = { name, checks: {} }; const log = []; const calls = { q: 0, userId: 0, beatmaps: 0 };
  const ok = (k, v, d) => { R.checks[k] = { pass: !!v, detail: d }; };
  const ctx = await browser.newContext({ viewport }); const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') log.push(m.text()); });
  page.on('pageerror', (e) => log.push(e.message));
  await ctx.route('**/*', async (r) => {
    const u = r.request().url();
    const json = (b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.includes('/api/osu/player/beatmaps')) {
      calls.beatmaps++; const sp = new URL(u).searchParams; const uid = Number(sp.get('userId')); const type = sp.get('type');
      const off = { best: 0, most_played: 10, favourite: 20 }[type] || 0;
      const items = Array.from({ length: 6 }, (_, i) => ({ beatmapset: mkSet(uid * 100 + off + i, `P${uid} ${type} ${i}`), meta: { pp: 500, rank: 'S', accuracy: 99, mods: [], count: 5 } }));
      return json({ type, items, fetched: 6, total: 6 });
    }
    if (u.includes('/api/osu/player')) {
      const sp = new URL(u).searchParams;
      if (sp.get('userId')) { calls.userId++; return json({ type: 'profile', user: userFor(Number(sp.get('userId'))) }); }
      calls.q++; const pg = Number(sp.get('page') || 1);
      const users = [0, 1, 2].map((i) => userFor(1001 + i + (pg > 1 ? pg * 10 : 0)));
      return json({ type: 'results', users, total: 45, page: pg });
    }
    if (u.includes('ppy.sh')) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return r.continue();
  });
  const text = () => page.evaluate(() => document.body.innerText);
  const clickText = (re) => page.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && r.test(e.innerText.trim())); if (!b) throw new Error('no button ' + src); b.click(); }, re);
  const count = async () => { const m = (await text()).match(/Download(?: All)? \((\d+)\)/); return m ? Number(m[1]) : null; };
  const settle = (ms = 600) => page.waitForTimeout(ms);
  const waitText = (s) => page.waitForFunction((t) => document.body.innerText.includes(t), s, { timeout: 20000 });
  const search = async (v) => { await page.fill('#playlist-url-input', v); await page.press('#playlist-url-input', 'Enter'); };
  const header = async () => (await text()).match(/\d+ players? found[^\n]*/i)?.[0];
  const pageLbl = async () => (await text()).match(/Page \d+ of \d+/)?.[0];
  const openState = () => page.evaluate(() => ['Best Performances', 'Most Played', 'Favourites'].map((l) => { const b = [...document.querySelectorAll('button')].find((e) => e.innerText.trim().startsWith(l)); return b ? b.style.background : 'missing'; }));
  const ticked = () => page.evaluate(() => [...document.querySelectorAll('[id^="checkbox-"]')].filter((e) => e.style.background.includes('255, 102, 170') && e.querySelector('svg')).map((e) => e.id));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#playlist-url-input', { timeout: 30000 }); await settle(800);
  await page.click('#search-mode-player-btn'); await settle();
  await search('user'); await waitText('userB'); await settle();
  await page.evaluate(() => { const s = [...document.querySelectorAll('span')].find((e) => /^Page 1 of/.test(e.innerText)); s.nextElementSibling.click(); });
  await waitText('userAp2'); await settle();
  const h0 = await header(); const p0 = await pageLbl();
  await clickText('^userBp2'); await waitText('best 0'); await settle(800);
  await clickText('^Most Played'); await waitText('most_played 0'); await settle(600);
  await clickText('^Best Performances'); await settle(400);
  await page.evaluate(() => { [...document.querySelectorAll('[id^="checkbox-"]')].filter((e) => e.offsetParent !== null).slice(0, 2).forEach((e) => e.click()); });
  await settle(400);
  const n1 = await count(); const open1 = await openState(); const tick1 = await ticked();
  await page.screenshot({ path: path.join(OUT, `x_${name}_1_profile_page2.png`) });
  const before = { ...calls };
  await clickText('^Change Player$'); await settle();
  const t2 = await text();
  ok('back_same_header', (await header()) === h0, [h0, await header()]);
  ok('back_same_page', (await pageLbl()) === p0 && t2.includes('userAp2'), [p0, await pageLbl()]);
  ok('back_sections_hidden', !t2.includes('Most Played') && !t2.includes('Best Performances'));
  ok('back_count_kept', n1 === 2 && (await count()) === n1, [n1, await count()]);
  await page.screenshot({ path: path.join(OUT, `x_${name}_2_back_page2.png`) });
  await clickText('^userBp2'); await settle(600);
  ok('repick_no_requests', JSON.stringify(before) === JSON.stringify(calls), [before, calls]);
  ok('repick_open_state_same', JSON.stringify(open1) === JSON.stringify(await openState()), [open1, await openState()]);
  ok('repick_ticks_same', (await count()) === n1 && JSON.stringify(tick1) === JSON.stringify(await ticked()), [n1, await count(), tick1, await ticked()]);
  await clickText('^Change Player$'); await settle();
  await page.evaluate(() => document.querySelector('button[aria-label="Clear player results"]').click()); await settle();
  const t = await text();
  ok('trash_from_list_clears_all', !/players found/i.test(t) && !t.includes('Back to') && (await count()) === null, (await count()));
  await page.screenshot({ path: path.join(OUT, `x_${name}_3_after_trash_from_list.png`) });
  ok('no_console_errors', log.length === 0, log);
  R.calls = calls; await ctx.close(); return R;
}
(async () => {
  const hard = setTimeout(() => process.exit(2), 200000);
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] }); const res = [];
  try { res.push(await run(b, 'desktop', { width: 1280, height: 800 })); res.push(await run(b, 'phone', { width: 375, height: 812 })); } catch (e) { res.push({ error: String(e.stack || e) }); }
  await b.close(); clearTimeout(hard);
  fs.writeFileSync(path.join(OUT, 'extra-verify-results.json'), JSON.stringify(res, null, 2));
  for (const r of res) { if (r.error) { console.log('ERROR', r.error); continue; } for (const [k, v] of Object.entries(r.checks)) console.log(r.name, v.pass ? 'PASS' : 'FAIL', k, JSON.stringify(v.detail)); console.log(JSON.stringify(r.calls)); }
})();
