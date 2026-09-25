// Verifier round 1: ONE live osu! flow (no stubs), then a phone resize for DOM checks.
// Run: NODE_PATH="$(npm root -g)" node todo-run/shots/11/verify-live.cjs
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';
const QUERY = process.env.Q || 'mrekk';

(async () => {
  const hard = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 240000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const R = { checks: {}, log: [] };
  const ok = (k, v, d) => { R.checks[k] = { pass: !!v, detail: d }; };
  const calls = []; const avatarReqs = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') R.log.push(m.text()); });
    page.on('request', (r) => { const u = r.url(); if (u.includes('/api/osu/')) calls.push(u.replace(BASE, '')); if (u.includes('a.ppy.sh')) avatarReqs.push(u); });
    const count = () => ({ q: calls.filter((u) => /\/api\/osu\/player\?.*q=/.test(u)).length, userId: calls.filter((u) => /\/api\/osu\/player\?.*userId=/.test(u)).length, beatmaps: calls.filter((u) => u.includes('/api/osu/player/beatmaps')).length, total: calls.length });
    const settle = (ms = 800) => page.waitForTimeout(ms);
    const clickText = (re) => page.evaluate((src) => { const r = new RegExp(src, 'i'); const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && r.test(e.innerText.trim())); if (!b) throw new Error('no button ' + src); b.click(); }, re);
    const AV = 'img[src*="a.ppy.sh"]';
    const avs = () => page.evaluate((s) => [...document.querySelectorAll(s)].map((i) => ({ src: i.src, alt: i.alt, loading: i.getAttribute('loading'), decoding: i.getAttribute('decoding'), nw: i.naturalWidth, complete: i.complete, top: Math.round(i.getBoundingClientRect().top) })), AV);

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#playlist-url-input', { timeout: 30000 }); await settle();
    await page.click('#search-mode-player-btn'); await settle(400);
    await page.fill('#playlist-url-input', QUERY); await page.press('#playlist-url-input', 'Enter');
    await page.waitForFunction(() => document.querySelectorAll('img[src*="a.ppy.sh"]').length > 0, null, { timeout: 30000 }); await settle(2500);
    const list = await avs();
    R.avatarReqsBeforeScroll = avatarReqs.length;
    ok('desk_results_lazy_async', list.length > 0 && list.every((a) => a.loading === 'lazy' && a.decoding === 'async'), { n: list.length, sample: list.slice(0, 2), bad: list.filter((a) => a.loading !== 'lazy' || a.decoding !== 'async') });
    ok('desk_one_search', count().q === 1 && count().total === 1, count());
    await page.screenshot({ path: path.join(OUT, 'vr_desktop_results.png') });

    // phone DOM check on the same results (resize, no new call)
    await page.setViewportSize({ width: 375, height: 812 }); await settle(1200);
    const plist = await avs();
    ok('phone_results_lazy_async', plist.length > 0 && plist.every((a) => a.loading === 'lazy' && a.decoding === 'async'), { n: plist.length });
    await page.screenshot({ path: path.join(OUT, 'vr_phone_results.png') });
    for (let i = 0; i < plist.length; i++) { await page.evaluate(([s, k]) => document.querySelectorAll(s)[k].scrollIntoView({ block: 'center' }), [AV, i]); await settle(250); }
    await settle(1500);
    const plist2 = await avs();
    ok('phone_results_render_after_scroll', plist2.every((a) => a.nw > 0), plist2.map((a) => a.nw));
    await page.screenshot({ path: path.join(OUT, 'vr_phone_results_scrolled.png') });
    await page.setViewportSize({ width: 1280, height: 800 }); await settle(800);
    const dlist = await avs();
    ok('desk_results_render', dlist.every((a) => a.nw > 0), dlist.map((a) => a.nw));
    ok('no_call_from_resize_scroll', count().total === 1, count());

    // pick first player
    const first = list[0].alt;
    R.picked = first;
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate((s) => { const i = document.querySelector(s); (i.closest('button') || i.closest('[role=button]') || i.parentElement).click(); }, AV);
    await page.waitForFunction(() => /show more/i.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    await settle(2500);
    ok('pick_calls', count().userId === 1 && count().beatmaps === 1, count());
    // open one extra section
    await clickText('^Most Played'); await settle(4000);
    ok('section_call', count().beatmaps === 2, count());
    const before = count().total;
    await clickText('^Show more'); await settle(1500);
    ok('show_more_no_call', count().total === before, count());
    await page.screenshot({ path: path.join(OUT, 'vr_desktop_sections.png') });
    await clickText('^Change Player$'); await settle(1500);
    const chip = async () => page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && /^Back to/i.test(e.innerText.trim())); if (!b) return null; b.scrollIntoView({ block: 'center' }); const i = b.querySelector('img'); return { text: b.innerText.trim(), img: i && { loading: i.getAttribute('loading'), decoding: i.getAttribute('decoding'), nw: i.naturalWidth } }; });
    await chip(); await settle(1500);
    const c1 = await chip();
    ok('desk_chip', c1 && c1.img && c1.img.loading === 'lazy' && c1.img.decoding === 'async' && c1.img.nw > 0, c1);
    await page.screenshot({ path: path.join(OUT, 'vr_desktop_chip.png') });
    await page.setViewportSize({ width: 375, height: 812 }); await settle(1200);
    await chip(); await settle(1000);
    const c2 = await chip();
    ok('phone_chip', c2 && c2.img && c2.img.loading === 'lazy' && c2.img.decoding === 'async' && c2.img.nw > 0, c2);
    await page.screenshot({ path: path.join(OUT, 'vr_phone_chip.png') });
    ok('change_player_no_call', count().total === before, count());
    R.calls = calls; R.final = count();
    await ctx.close();
  } catch (e) { R.error = String(e && e.stack || e); R.calls = calls; }
  await browser.close(); clearTimeout(hard);
  fs.writeFileSync(path.join(OUT, 'verify-live-results.json'), JSON.stringify(R, null, 2));
  const fails = Object.entries(R.checks).filter(([, v]) => !v.pass).map(([k, v]) => k + ' ' + JSON.stringify(v.detail));
  console.log(R.error ? 'ERROR ' + R.error : fails.length ? 'FAIL\n' + fails.join('\n') : 'ALL PASS');
  console.log(JSON.stringify({ final: R.final, calls: R.calls, avatarReqsBeforeScroll: R.avatarReqsBeforeScroll, picked: R.picked, log: R.log }, null, 1));
})();
