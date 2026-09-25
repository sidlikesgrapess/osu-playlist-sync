// Item 12 verify round 2 (acceptance lens), independent of verify.cjs. ONE live osu! flow.
// Run: NODE_PATH="$(npm root -g)" node todo-run/shots/12/verify-r2-acceptance.cjs
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';

(async () => {
  const hard = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 280000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const R = { checks: {}, log: [], data: {} };
  const ok = (k, v, d) => { R.checks[k] = { pass: !!v, detail: d }; };
  const calls = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') R.log.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => R.log.push('pageerror ' + e.message));
    page.on('request', (r) => { const u = r.url(); if (u.includes('/api/osu/')) calls.push(u.replace(BASE, '')); });
    const bm = () => calls.filter((u) => u.includes('/api/osu/player/beatmaps'));
    const wait = (ms) => page.waitForTimeout(ms);

    const geo = () => page.evaluate(() => {
      const bar = document.getElementById('playlist-url-input').closest('div[style*="sticky"]');
      const b = bar.getBoundingClientRect();
      const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--player-dock-top'));
      const s = {};
      for (const card of document.querySelectorAll('[data-section]')) {
        const h = card.querySelector('.ps-header'); const hr = h.getBoundingClientRect(); const cr = card.getBoundingClientRect();
        const body = card.querySelector('[id^="player-section-body-"]');
        const btn = card.querySelector('.ps-collapse-btn');
        const cx = Math.min(hr.left + hr.width / 2, innerWidth - 2), cy = hr.top + hr.height / 2;
        const hit = cy > 0 && cy < innerHeight ? document.elementFromPoint(cx, cy) : null;
        const label = h.querySelector('span');
        s[card.dataset.section] = {
          cardTop: cr.top, cardBottom: cr.bottom, hTop: hr.top, hBottom: hr.bottom, hH: hr.height, hRight: hr.right,
          pos: getComputedStyle(h).position, z: getComputedStyle(h).zIndex, bg: getComputedStyle(h).backgroundColor,
          expanded: btn.getAttribute('aria-expanded'), label: btn.getAttribute('aria-label'), mainExpanded: h.querySelector('button').getAttribute('aria-expanded'),
          rows: body ? body.querySelectorAll('[id^="checkbox-"]').length : 0,
          bodyH: body ? body.getBoundingClientRect().height : 0,
          bodyScroll: body ? [body.scrollHeight, body.clientHeight, body.firstElementChild.scrollHeight, body.firstElementChild.clientHeight] : null,
          bodyTrans: body ? getComputedStyle(body).transition : null,
          chevTrans: getComputedStyle(btn.querySelector('svg')).transitionDuration,
          hitInHeader: hit ? h.contains(hit) : null,
          labelTrunc: label ? label.scrollWidth > label.clientWidth : null,
          btnRect: btn.getBoundingClientRect().toJSON(),
          cardOverflow: getComputedStyle(card).overflow, cardRadius: getComputedStyle(card).borderRadius,
        };
      }
      const barHit = document.elementFromPoint(innerWidth / 2, b.bottom - 2);
      const bad = [...document.querySelectorAll('[data-section] *')].filter((e) => { const c = getComputedStyle(e); return (c.maxHeight !== 'none' && parseFloat(c.maxHeight) >= 100) || ((c.overflowY === 'auto' || c.overflowY === 'scroll')); }).map((e) => e.tagName + ':' + getComputedStyle(e).maxHeight + ':' + getComputedStyle(e).overflowY);
      return { barBottom: b.bottom, barZ: getComputedStyle(bar).zIndex, barHitInBar: bar.contains(barHit), dockVar: v, scrollY, maxScroll: document.scrollingElement.scrollHeight - innerHeight, sw: document.scrollingElement.scrollWidth, vw: innerWidth, vh: innerHeight, s, bad };
    });
    const scrollCardTo = (type, offsetFromDock) => page.evaluate(([t, o]) => {
      const c = document.querySelector(`[data-section="${t}"]`); const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--player-dock-top'));
      window.scrollTo(0, window.scrollY + c.getBoundingClientRect().top - v + o);
    }, [type, offsetFromDock]);
    const shot = (n) => page.screenshot({ path: path.join(OUT, `r2_${n}.png`) });

    // ---- one live flow
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#playlist-url-input', { timeout: 30000 }); await wait(800);
    await page.click('#search-mode-player-btn'); await wait(400);
    await page.fill('#playlist-url-input', 'mrekk'); await page.press('#playlist-url-input', 'Enter');
    await page.waitForFunction(() => document.querySelectorAll('img[src*="a.ppy.sh"]').length > 0, null, { timeout: 30000 }); await wait(1200);
    await page.evaluate(() => { const i = document.querySelector('img[src*="a.ppy.sh"]'); (i.closest('button') || i.parentElement).click(); });
    await page.waitForFunction(() => document.querySelectorAll('[data-section="best"] [id^="checkbox-"]').length > 0, null, { timeout: 30000 }); await wait(1500);
    ok('A10_best_first_open_one_call', bm().length === 1 && bm()[0].includes('best'), bm());

    const g0 = await geo(); R.data.g0 = g0;
    ok('A1_no_inner_scroll_or_maxheight', g0.bad.length === 0, g0.bad);
    ok('A1_best_full_length', g0.s.best.rows === 25 && g0.s.best.bodyScroll[0] === g0.s.best.bodyScroll[1] && g0.s.best.bodyScroll[2] === g0.s.best.bodyScroll[3], g0.s.best.bodyScroll);
    ok('A6_card_not_overflow_hidden', g0.s.best.cardOverflow !== 'hidden' && g0.s.best.cardRadius === '10px', [g0.s.best.cardOverflow, g0.s.best.cardRadius]);
    ok('A7_aria', g0.s.best.label === 'Collapse Best Performances' && g0.s.best.expanded === 'true' && g0.s.most_played.label === 'Expand Most Played' && g0.s.most_played.expanded === 'false', [g0.s.best.label, g0.s.most_played.label]);

    // A9: open animation is not instant. Open Most Played by its main header button and sample body height.
    const before = bm().length;
    await page.evaluate(() => document.querySelector('[data-section="most_played"] .ps-header > button').click());
    await page.waitForFunction(() => document.querySelectorAll('[data-section="most_played"] [id^="checkbox-"]').length > 0, null, { timeout: 30000 });
    const samples = await page.evaluate(() => new Promise((res) => {
      const out = []; const t0 = performance.now();
      const f = () => { const b = document.getElementById('player-section-body-most_played'); out.push([Math.round(performance.now() - t0), b ? Math.round(b.getBoundingClientRect().height) : -1]); if (performance.now() - t0 < 500) requestAnimationFrame(f); else res(out); };
      requestAnimationFrame(f);
    }));
    R.data.openSamples = samples;
    await wait(600);
    ok('A10_mp_first_open_one_call', bm().length === before + 1 && bm()[before].includes('most_played'), bm());
    const gm = await geo();
    ok('A9_body_transition_easing', /grid-template-rows 0\.3s cubic-bezier\(0\.16, 1, 0\.3, 1\)/.test(gm.s.most_played.bodyTrans), gm.s.most_played.bodyTrans);
    const finalH = gm.s.most_played.bodyH;
    const mids = samples.filter(([, h]) => h > 5 && h < finalH - 5);
    ok('A9_open_animates_intermediate_heights', mids.length >= 3, { finalH, mids: mids.slice(0, 6), n: samples.length });

    for (const vp of [{ n: 'desktop', w: 1280, h: 800 }, { n: 'phone', w: 375, h: 812 }]) {
      await page.setViewportSize({ width: vp.w, height: vp.h }); await wait(800);
      await page.evaluate(() => window.scrollTo(0, 0)); await wait(500);
      const gi = await geo();
      // A3/A4 mid Best
      await scrollCardTo('best', 600); await wait(700);
      const g1 = await geo(); R.data[vp.n + '_midBest'] = g1;
      ok(`${vp.n}_A3_best_docked_at_bar_bottom`, Math.abs(g1.s.best.hTop - g1.barBottom) <= 1 && g1.s.best.pos === 'sticky', { hTop: g1.s.best.hTop, bar: g1.barBottom });
      ok(`${vp.n}_A4_var_equals_bar_bottom`, Math.abs(g1.dockVar - g1.barBottom) <= 1, [g1.dockVar, g1.barBottom]);
      ok(`${vp.n}_A5_header_below_bar`, g1.barHitInBar && Number(g1.s.best.z) < Number(g1.barZ) && g1.s.best.hitInHeader === true, { barHit: g1.barHitInBar, z: g1.s.best.z, barZ: g1.barZ, hit: g1.s.best.hitInHeader });
      ok(`${vp.n}_A11_one_line`, Math.abs(g1.s.best.hH - gi.s.best.hH) <= 1 && g1.s.best.hH < 60 && g1.s.best.btnRect.right <= vp.w && Math.abs(g1.s.best.btnRect.top + 15 - (g1.s.best.hTop + g1.s.best.hH / 2)) <= 2, { hH: [gi.s.best.hH, g1.s.best.hH], btn: g1.s.best.btnRect, trunc: g1.s.best.labelTrunc });
      R.data[vp.n + '_labelTrunc'] = { best: g1.s.best.labelTrunc };
      ok(`${vp.n}_A11_no_hscroll`, g1.sw <= vp.w, [g1.sw, vp.w]);
      await shot(`${vp.n}_best_docked`);

      // A4 during the bar's dock transition: sample header vs bar every frame after crossing 180.
      await page.evaluate(() => window.scrollTo(0, 100)); await wait(600);
      // put Best's card top above the dock regardless of bar state by scrolling past 180 in one jump
      const dockTrack = await page.evaluate(() => new Promise((res) => {
        const bar = document.getElementById('playlist-url-input').closest('div[style*="sticky"]');
        const h = document.querySelector('[data-section="best"] .ps-header'); const card = document.querySelector('[data-section="best"]');
        const target = window.scrollY + card.getBoundingClientRect().top - 100; window.scrollTo(0, Math.max(target, 400));
        const out = []; const t0 = performance.now();
        const f = () => { out.push([Math.round(performance.now() - t0), Math.round(bar.getBoundingClientRect().bottom * 10) / 10, Math.round(h.getBoundingClientRect().top * 10) / 10]); if (performance.now() - t0 < 600) requestAnimationFrame(f); else res(out); };
        requestAnimationFrame(f);
      }));
      R.data[vp.n + '_dockTrack'] = dockTrack;
      const worst = Math.max(...dockTrack.map(([, b, t]) => Math.abs(b - t)));
      const barChanged = new Set(dockTrack.map(([, b]) => b)).size > 1;
      ok(`${vp.n}_A4_tracks_bar_during_dock_anim`, worst <= 1, { worst, barChanged, first: dockTrack.slice(0, 4) });

      // A5 sweep across the Best -> Most Played boundary
      const sweep = [];
      for (let o = -120; o <= 60; o += 12) {
        await scrollCardTo('most_played', o); await wait(60);
        const g = await geo();
        sweep.push({ o, bestTop: g.s.best.hTop, bestBottom: g.s.best.hBottom, mpTop: g.s.most_played.hTop, bar: g.barBottom, bestCardBottom: g.s.best.cardBottom, mpHit: g.s.most_played.hitInHeader });
      }
      R.data[vp.n + '_sweep'] = sweep;
      ok(`${vp.n}_A5_push_out_no_overlap`, sweep.every((x) => x.bestBottom <= x.mpTop + 0.5 && x.bestBottom <= x.bestCardBottom + 0.5 && x.mpTop >= x.bar - 1), sweep.filter((x) => !(x.bestBottom <= x.mpTop + 0.5 && x.mpTop >= x.bar - 1)));
      const pushed = sweep.some((x) => x.bestTop < x.bar - 5 && x.bestBottom > x.bar - 60);
      ok(`${vp.n}_A5_best_actually_pushed_up`, pushed, sweep.map((x) => [x.o, Math.round(x.bestTop), Math.round(x.mpTop)]));
      await scrollCardTo('most_played', -20); await wait(300); await shot(`${vp.n}_boundary`);

      // A8 collapse Best from docked while content is below (Most Played open below it)
      await scrollCardTo('best', 900); await wait(600);
      const gb = await geo();
      const c0 = calls.length;
      await page.click('[data-section="best"] .ps-collapse-btn');
      const track = await page.evaluate(() => new Promise((res) => {
        const h = document.querySelector('[data-section="best"] .ps-header'); const out = []; const t0 = performance.now();
        const f = () => { out.push([Math.round(performance.now() - t0), Math.round(h.getBoundingClientRect().top)]); if (performance.now() - t0 < 500) requestAnimationFrame(f); else res(out); };
        requestAnimationFrame(f);
      }));
      await wait(400);
      const gc = await geo(); R.data[vp.n + '_collapseBest'] = { before: gb.s.best, after: gc.s.best, track, bar: gc.barBottom };
      ok(`${vp.n}_A8_best_was_docked`, Math.abs(gb.s.best.hTop - gb.barBottom) <= 1, gb.s.best.hTop);
      ok(`${vp.n}_A8_collapse_best_lands_on_dock`, gc.s.best.expanded === 'false' && gc.s.best.rows === 0 && Math.abs(gc.s.best.hTop - gc.barBottom) <= 1 && gc.s.best.label === 'Expand Best Performances', { hTop: gc.s.best.hTop, bar: gc.barBottom, rows: gc.s.best.rows });
      ok(`${vp.n}_A8_header_stays_in_view_during_collapse`, track.every(([, t]) => t >= gc.barBottom - 2 && t <= vp.h - 40), track.filter(([, t]) => !(t >= gc.barBottom - 2 && t <= vp.h - 40)).slice(0, 5));
      ok(`${vp.n}_A8_closed_header_inside_card`, Math.abs(gc.s.best.hTop - gc.s.best.cardTop) <= 2 && gc.s.best.hBottom <= gc.s.best.cardBottom + 1, gc.s.best);
      await shot(`${vp.n}_best_collapsed`);
      // Reopen by keyboard (Enter on the focused collapse button)
      await page.focus('[data-section="best"] .ps-collapse-btn'); await page.keyboard.press('Enter'); await wait(800);
      const gr = await geo();
      ok(`${vp.n}_A10_reopen_best_no_call_keyboard`, gr.s.best.rows === 25 && gr.s.best.expanded === 'true' && calls.length === c0, { rows: gr.s.best.rows, n: calls.length - c0 });

      // A8 collapse Most Played from docked via the MAIN header button (the whole header toggles)
      await scrollCardTo('most_played', 700); await wait(600);
      const gd = await geo();
      await page.evaluate(() => document.querySelector('[data-section="most_played"] .ps-header > button').click()); await wait(900);
      const ge = await geo(); R.data[vp.n + '_collapseMP'] = { before: gd.s.most_played, after: ge.s.most_played, bar: ge.barBottom, scrollY: ge.scrollY, max: ge.maxScroll };
      const mp = ge.s.most_played;
      ok(`${vp.n}_A8_collapse_mp_main_btn_in_view`, gd.s.most_played.pos === 'sticky' && Math.abs(gd.s.most_played.hTop - gd.barBottom) <= 1 && mp.expanded === 'false' && mp.mainExpanded === 'false' && mp.rows === 0 && mp.hTop >= ge.barBottom - 1 && mp.hBottom <= vp.h && (Math.abs(mp.hTop - ge.barBottom) <= 1 || ge.scrollY >= ge.maxScroll - 1), { hTop: mp.hTop, bar: ge.barBottom, scrollY: ge.scrollY, max: ge.maxScroll });
      await shot(`${vp.n}_mp_collapsed`);
      await page.click('[data-section="most_played"] .ps-collapse-btn'); await wait(900);
      const gf = await geo();
      ok(`${vp.n}_A10_reopen_mp_no_call`, gf.s.most_played.rows > 0 && calls.length === c0, calls.length - c0);
      ok(`${vp.n}_A11_no_hscroll_end`, gf.sw <= vp.w, gf.sw);
    }

    // A4 resize: var follows the bar after a width change
    await page.setViewportSize({ width: 900, height: 800 }); await wait(700);
    await scrollCardTo('best', 500); await wait(600);
    const gz = await geo();
    ok('A4_var_after_resize_900', Math.abs(gz.dockVar - gz.barBottom) <= 1 && Math.abs(gz.s.best.hTop - gz.barBottom) <= 1, [gz.dockVar, gz.barBottom, gz.s.best.hTop]);

    // A2 Show more
    await page.setViewportSize({ width: 1280, height: 800 }); await wait(600);
    const c1 = calls.length;
    const smText = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-section="best"] button')].find((e) => /^Show more/.test(e.innerText.trim())); const t = b.innerText; b.click(); return t; });
    await wait(900);
    const gs = await geo();
    ok('A2_show_more_25_no_call', gs.s.best.rows === 50 && calls.length === c1 && /^Show more \(\d+ left\)$/.test(smText.trim()), { rows: gs.s.best.rows, smText, n: calls.length - c1 });
    const gs2 = await geo();
    ok('A1_after_show_more_full_length', gs2.s.best.bodyScroll[0] === gs2.s.best.bodyScroll[1] && gs2.s.best.bodyScroll[2] === gs2.s.best.bodyScroll[3], gs2.s.best.bodyScroll);

    // A9 reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' }); await wait(500);
    const gRM = await geo();
    ok('A9_reduced_motion_none', /none|^all 0s|0s/.test(gRM.s.best.bodyTrans) && gRM.s.best.chevTrans === '0s', [gRM.s.best.bodyTrans, gRM.s.best.chevTrans]);
    await scrollCardTo('best', 900); await wait(400);
    const smoothUsed = await page.evaluate(() => { let used = []; const o = window.scrollTo; window.scrollTo = function (a, b) { used.push(typeof a === 'object' ? a.behavior || 'auto' : 'auto'); return o.apply(this, arguments); }; window.__used = used; document.querySelector('[data-section="best"] .ps-collapse-btn').click(); return new Promise((r) => requestAnimationFrame(() => r({ used, h: document.getElementById('player-section-body-best') ? document.getElementById('player-section-body-best').getBoundingClientRect().height : 0 }))); });
    await wait(200);
    const gRM2 = await geo();
    ok('A9_reduced_motion_collapse_instant_auto', smoothUsed.used.length >= 1 && smoothUsed.used.every((b) => b !== 'smooth') && smoothUsed.h === 0 && Math.abs(gRM2.s.best.hTop - gRM2.barBottom) <= 1, { smoothUsed, hTop: gRM2.s.best.hTop, bar: gRM2.barBottom });
    await page.click('[data-section="best"] .ps-collapse-btn'); await wait(300);

    R.counts = { q: calls.filter((u) => /\/api\/osu\/player\?.*q=/.test(u)).length, userId: calls.filter((u) => /\/api\/osu\/player\?.*userId=/.test(u)).length, beatmaps: bm().length, total: calls.length };
    ok('A10_total_calls', R.counts.q === 1 && R.counts.userId === 1 && R.counts.beatmaps === 2, R.counts);
    R.calls = calls;
    await ctx.close();
  } catch (e) { R.error = String(e && e.stack || e); R.calls = calls; }
  await browser.close(); clearTimeout(hard);
  fs.writeFileSync(path.join(OUT, 'verify-r2-acceptance-results.json'), JSON.stringify(R, null, 2));
  const fails = Object.entries(R.checks).filter(([, v]) => !v.pass).map(([k, v]) => k + ' ' + JSON.stringify(v.detail).slice(0, 600));
  console.log(R.error ? 'ERROR ' + R.error : '');
  console.log(fails.length ? `FAIL ${fails.length}/${Object.keys(R.checks).length}\n` + fails.join('\n') : `ALL PASS (${Object.keys(R.checks).length})`);
  console.log(JSON.stringify({ counts: R.counts, log: R.log.slice(0, 5), labelTrunc: [R.data.desktop_labelTrunc, R.data.phone_labelTrunc] }, null, 1));
})();
