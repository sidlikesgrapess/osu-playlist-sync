// Item 12 VERIFIER round 1 (acceptance lens). One live osu! flow, then adversarial checks.
// Run: NODE_PATH="$(npm root -g)" node todo-run/shots/12/verify-acceptance.cjs
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';

(async () => {
  const hard = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 280000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const R = { checks: {}, log: [], samples: {} };
  const ok = (k, v, d) => { R.checks[k] = { pass: !!v, detail: d }; console.log((v ? 'PASS ' : 'FAIL ') + k, JSON.stringify(d).slice(0, 300)); };
  const calls = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => R.log.push('pageerror ' + e.message));
    page.on('request', (r) => { const u = r.url(); if (u.includes('/api/osu/')) calls.push(u.replace(BASE, '')); });
    const n = () => calls.length;
    const bm = () => calls.filter((u) => u.includes('/api/osu/player/beatmaps')).length;
    const settle = (ms = 700) => page.waitForTimeout(ms);
    await page.addInitScript(() => {
      window.__scrolls = [];
      const orig = window.scrollTo.bind(window);
      window.scrollTo = function (...a) { window.__scrolls.push(JSON.stringify(a)); return orig(...a); };
    });

    const G = () => page.evaluate(() => {
      const bar = document.getElementById('playlist-url-input').closest('div[style*="sticky"]');
      const out = { barBottom: bar.getBoundingClientRect().bottom, barZ: getComputedStyle(bar).zIndex,
        v: getComputedStyle(document.documentElement).getPropertyValue('--player-dock-top').trim(),
        sy: scrollY, sw: document.scrollingElement.scrollWidth, vw: innerWidth, vh: innerHeight, s: {} };
      for (const c of document.querySelectorAll('[data-section]')) {
        const h = c.querySelector('.ps-header'); const hr = h.getBoundingClientRect(); const cr = c.getBoundingClientRect();
        const body = c.querySelector('[id^="player-section-body-"]'); const btn = c.querySelector('.ps-collapse-btn');
        // what is painted at the header's centre: the header itself, or something on top of it?
        const cx = hr.left + hr.width / 2, cy = hr.top + hr.height / 2;
        const hit = (cy > 0 && cy < innerHeight) ? document.elementFromPoint(cx, cy) : null;
        out.s[c.dataset.section] = { cT: cr.top, cB: cr.bottom, hT: hr.top, hB: hr.bottom, hH: hr.height,
          pos: getComputedStyle(h).position, z: getComputedStyle(h).zIndex, bg: getComputedStyle(h).backgroundColor,
          exp: btn.getAttribute('aria-expanded'), label: btn.getAttribute('aria-label'),
          rows: body ? body.querySelectorAll('[id^="checkbox-"]').length : 0, bodyH: body ? body.getBoundingClientRect().height : 0,
          bodySc: body ? [body.scrollHeight, body.clientHeight, body.firstElementChild.scrollHeight, body.firstElementChild.clientHeight] : null,
          tr: body ? getComputedStyle(body).transition : null,
          hitInHeader: hit ? h.contains(hit) : null, cardRadius: getComputedStyle(c).borderRadius, cardOv: getComputedStyle(c).overflow };
      }
      out.innerScrollers = [...document.querySelectorAll('[data-section] *')].filter((e) => { const s = getComputedStyle(e); return (s.maxHeight !== 'none' && parseFloat(s.maxHeight) > 0) || s.overflowY === 'auto' || s.overflowY === 'scroll'; }).map(e => e.tagName + ':' + getComputedStyle(e).maxHeight + ':' + getComputedStyle(e).overflowY).slice(0, 10);
      return out;
    });
    const scrollTo = (type, frac, off = 300) => page.evaluate(([t, f, o]) => { const c = document.querySelector(`[data-section="${t}"]`); const r = c.getBoundingClientRect(); window.scrollTo(0, scrollY + r.top + r.height * f - o); }, [type, frac, off]);
    const shot = (name) => page.screenshot({ path: path.join(OUT, name) });

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#playlist-url-input', { timeout: 30000 }); await settle();
    await page.click('#search-mode-player-btn'); await settle(400);
    await page.fill('#playlist-url-input', 'mrekk'); await page.press('#playlist-url-input', 'Enter');
    await page.waitForFunction(() => document.querySelectorAll('img[src*="a.ppy.sh"]').length > 0, null, { timeout: 30000 }); await settle(1500);
    await page.evaluate(() => { const i = document.querySelector('img[src*="a.ppy.sh"]'); (i.closest('button') || i.parentElement).click(); });
    await page.waitForFunction(() => document.querySelectorAll('[data-section="best"] [id^="checkbox-"]').length > 0, null, { timeout: 30000 }); await settle(1500);
    ok('A10_initial_calls', bm() === 1, calls.slice());

    let g = await G();
    ok('A1_no_inner_scroll', g.innerScrollers.length === 0, g.innerScrollers);
    ok('A1_best_full_length', g.s.best.rows === 25 && g.s.best.bodySc[0] === g.s.best.bodySc[1] && g.s.best.bodySc[2] === g.s.best.bodySc[3], g.s.best);
    ok('A6_card_not_overflow_hidden_rounded', g.s.best.cardOv !== 'hidden' && g.s.best.cardRadius === '10px', [g.s.best.cardOv, g.s.best.cardRadius]);
    ok('A5_header_z_below_bar', +g.s.best.z < +g.barZ && +g.barZ < 60, [g.s.best.z, g.barZ]);
    ok('A5_closed_headers_not_sticky', g.s.most_played.pos !== 'sticky', g.s.most_played.pos);

    // Dock through the bar's own dock transition: sample scrollY 100 -> 400 in steps.
    const dockSamples = [];
    for (const y of [150, 200, 260]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y); await settle(600);
      const gg = await G(); dockSamples.push({ y, bar: gg.barBottom, v: gg.v });
    }
    ok('A4_var_tracks_bar', dockSamples.every(d => Math.abs(parseFloat(d.v) - d.bar) <= 1), dockSamples);

    // A3 desktop mid Best
    await scrollTo('best', 0.5); await settle();
    g = await G();
    ok('A3_desktop_best_docked', Math.abs(g.s.best.hT - g.barBottom) <= 1 && g.s.best.hitInHeader === true, { hT: g.s.best.hT, bar: g.barBottom, v: g.v, hit: g.s.best.hitInHeader });
    await shot('va_desktop_best_docked.png');

    // Open MP by its header text button
    const before = bm();
    await page.click('[data-section="most_played"] .ps-header button:not(.ps-collapse-btn)');
    await page.waitForFunction(() => document.querySelectorAll('[data-section="most_played"] [id^="checkbox-"]').length > 0, null, { timeout: 30000 }); await settle(1200);
    ok('A10_mp_one_call', bm() === before + 1, calls.slice(-2));

    // Sweep through Best -> MP boundary; headers must never overlap.
    const sweep = [];
    const mpStart = await page.evaluate(() => scrollY + document.querySelector('[data-section="most_played"]').getBoundingClientRect().top);
    const dock = parseFloat((await G()).v);
    for (let y = mpStart - dock - 120; y <= mpStart - dock + 80; y += 10) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y); await settle(60);
      const gg = await G(); const b = gg.s.best, m = gg.s.most_played;
      sweep.push({ y, bT: +b.hT.toFixed(1), bB: +b.hB.toFixed(1), mT: +m.hT.toFixed(1), overlap: b.hB > m.hT + 0.5, bAboveDock: b.hT < gg.barBottom - 0.5, mHit: m.hitInHeader, bHit: b.hitInHeader });
    }
    R.samples.sweep = sweep;
    ok('A5_no_overlap_sweep', sweep.every(s => !s.overlap), sweep.filter(s => s.overlap));
    ok('A5_prev_pushed_out', sweep.some(s => s.bAboveDock), sweep.filter(s => s.bAboveDock).slice(0, 2));
    ok('A5_headers_painted_on_top', sweep.every(s => s.mHit !== false), sweep.filter(s => s.mHit === false).slice(0, 3));
    await page.evaluate((yy) => window.scrollTo(0, yy), mpStart - dock - 30); await settle(300);
    await shot('va_desktop_boundary.png');

    // A7/A8: collapse MP from docked header via the collapse button, sampling header top mid animation.
    await scrollTo('most_played', 0.6); await settle();
    g = await G();
    ok('A3_desktop_mp_docked', Math.abs(g.s.most_played.hT - g.barBottom) <= 1, { hT: g.s.most_played.hT, bar: g.barBottom });
    ok('A7_label_collapse', g.s.most_played.label === 'Collapse Most Played' && g.s.most_played.exp === 'true', g.s.most_played.label);
    await shot('va_desktop_mp_docked.png');
    const c0 = n();
    await page.evaluate(() => { window.__scrolls = []; });
    await page.click('[data-section="most_played"] .ps-collapse-btn');
    const mid = [];
    for (let i = 0; i < 8; i++) { await page.waitForTimeout(50); const gg = await G(); mid.push(+gg.s.most_played.hT.toFixed(1)); }
    await settle(500);
    g = await G();
    const sc = await page.evaluate(() => window.__scrolls);
    ok('A8_collapse_in_view', g.s.most_played.exp === 'false' && g.s.most_played.rows === 0 && g.s.most_played.hT >= 0 && g.s.most_played.hB <= g.vh && mid.every(t => t >= 0 && t < g.vh), { hT: g.s.most_played.hT, bar: g.barBottom, mid, sc, label: g.s.most_played.label });
    ok('A7_label_expand', g.s.most_played.label === 'Expand Most Played', g.s.most_played.label);
    await shot('va_desktop_collapsed.png');
    await page.click('[data-section="most_played"] .ps-collapse-btn'); await settle(800);
    g = await G();
    ok('A10_no_calls_collapse_reopen', n() === c0 && g.s.most_played.rows === 25, { calls: n() - c0, rows: g.s.most_played.rows });

    // Collapse Best from its docked header via the WHOLE header button (not the chevron).
    await scrollTo('best', 0.7); await settle();
    await page.click('[data-section="best"] .ps-header button:not(.ps-collapse-btn)'); await settle(800);
    g = await G();
    ok('A8_best_collapse_via_header', g.s.best.exp === 'false' && g.s.best.hT >= 0 && g.s.best.hB <= g.vh, { hT: g.s.best.hT, exp: g.s.best.exp });
    await page.click('[data-section="best"] .ps-collapse-btn'); await settle(800);

    // A9 transitions: easing + duration
    g = await G();
    ok('A9_transition_easing', /cubic-bezier\(0\.16, 1, 0\.3, 1\)/.test(g.s.best.tr) && /0\.3s|300ms/.test(g.s.best.tr), g.s.best.tr);

    // A2 show more
    const c1 = n();
    await scrollTo('best', 0.95); await settle(300);
    const sm = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-section="best"] button')].find(x => /Show more/.test(x.textContent)); if (!b) return null; const t = b.textContent; b.click(); return t; });
    await settle(700); g = await G();
    ok('A2_show_more', sm && /25/.test(sm) && g.s.best.rows === 50 && n() === c1, { sm, rows: g.s.best.rows, calls: n() - c1 });

    // Resize updates the var
    await page.setViewportSize({ width: 900, height: 800 }); await settle(600);
    g = await G(); ok('A4_var_on_resize', Math.abs(parseFloat(g.v) - g.barBottom) <= 1, { v: g.v, bar: g.barBottom });

    // Phone
    await page.setViewportSize({ width: 375, height: 812 }); await settle(900);
    const phUndockH = (await G()).s.favourite.hH;
    await scrollTo('best', 0.5, 450); await settle();
    g = await G();
    ok('A3_phone_best_docked', Math.abs(g.s.best.hT - g.barBottom) <= 1 && g.s.best.hitInHeader === true, { hT: g.s.best.hT, bar: g.barBottom, v: g.v });
    ok('A11_phone_one_line', Math.abs(g.s.best.hH - phUndockH) <= 1 && g.s.best.hH < 60, [g.s.best.hH, phUndockH]);
    ok('A11_phone_no_hscroll', g.sw <= 375, g.sw);
    await shot('va_phone_best_docked.png');
    const mpS = await page.evaluate(() => scrollY + document.querySelector('[data-section="most_played"]').getBoundingClientRect().top);
    const pd = parseFloat(g.v);
    const psw = [];
    for (let y = mpS - pd - 80; y <= mpS - pd + 40; y += 10) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y); await settle(60);
      const gg = await G(); psw.push({ y, bB: gg.s.best.hB, mT: gg.s.most_played.hT, overlap: gg.s.best.hB > gg.s.most_played.hT + 0.5 });
    }
    ok('A5_phone_no_overlap', psw.every(s => !s.overlap), psw.filter(s => s.overlap));
    await page.evaluate((yy) => window.scrollTo(0, yy), mpS - pd - 25); await settle(300);
    await shot('va_phone_boundary.png');
    await scrollTo('most_played', 0.6, 450); await settle();
    g = await G();
    ok('A3_phone_mp_docked', Math.abs(g.s.most_played.hT - g.barBottom) <= 1, { hT: g.s.most_played.hT, bar: g.barBottom });
    await shot('va_phone_mp_docked.png');
    const c2 = n();
    await page.click('[data-section="most_played"] .ps-collapse-btn'); await settle(800);
    g = await G();
    ok('A8_phone_collapse_in_view', g.s.most_played.exp === 'false' && g.s.most_played.hT >= 0 && g.s.most_played.hB <= g.vh && n() === c2, { hT: g.s.most_played.hT, calls: n() - c2 });
    await shot('va_phone_collapsed.png');
    await page.click('[data-section="most_played"] .ps-collapse-btn'); await settle(800);

    // Reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' }); await settle(500);
    g = await G();
    const trd = await page.evaluate(() => getComputedStyle(document.getElementById('player-section-body-best')).transitionDuration);
    ok('A9_reduced_motion_instant', /^0s(, 0s)*$/.test(trd) || g.s.best.tr.startsWith('none') || /all 0s/.test(g.s.best.tr), { trd, tr: g.s.best.tr });
    await scrollTo('most_played', 0.6, 450); await settle();
    await page.evaluate(() => { window.__scrolls = []; });
    await page.click('[data-section="most_played"] .ps-collapse-btn'); await settle(100);
    const sc2 = await page.evaluate(() => window.__scrolls);
    g = await G();
    ok('A9_reduced_collapse_auto', sc2.length > 0 && sc2.every(s => !/smooth/.test(s)) && g.s.most_played.rows === 0 && g.s.most_played.hT >= 0, { sc2, rows: g.s.most_played.rows, hT: g.s.most_played.hT });

    ok('A10_total_calls', bm() === 2 && calls.filter(u => /q=/.test(u)).length === 1 && calls.filter(u => /userId=/.test(u)).length === 1, calls);
  } catch (e) { R.error = String(e.stack || e); console.error(e); }
  finally {
    R.calls = calls;
    fs.writeFileSync(path.join(OUT, 'verify-acceptance-results.json'), JSON.stringify(R, null, 2));
    clearTimeout(hard); await browser.close();
  }
})();
