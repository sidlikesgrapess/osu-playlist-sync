// Item 12 implement sanity check: ONE live osu! flow, then DOM geometry checks at desktop
// and phone. Run: NODE_PATH="$(npm root -g)" node todo-run/shots/12/verify.cjs
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';
const QUERY = process.env.Q || 'mrekk';

(async () => {
  const hard = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 240000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const R = { checks: {}, log: [], geo: {} };
  const ok = (k, v, d) => { R.checks[k] = { pass: !!v, detail: d }; };
  const calls = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') R.log.push(m.text()); });
    page.on('pageerror', (e) => R.log.push('pageerror ' + e.message));
    page.on('request', (r) => { const u = r.url(); if (u.includes('/api/osu/')) calls.push(u.replace(BASE, '')); });
    const count = () => ({ q: calls.filter((u) => /\/api\/osu\/player\?.*q=/.test(u)).length, userId: calls.filter((u) => /\/api\/osu\/player\?.*userId=/.test(u)).length, beatmaps: calls.filter((u) => u.includes('/api/osu/player/beatmaps')).length, total: calls.length });
    const settle = (ms = 800) => page.waitForTimeout(ms);

    // Geometry of every section plus the search bar and the published variable.
    const geo = () => page.evaluate(() => {
      const bar = document.getElementById('playlist-url-input').closest('div[style*="sticky"]');
      const b = bar.getBoundingClientRect();
      const v = getComputedStyle(document.documentElement).getPropertyValue('--player-dock-top').trim();
      const secs = {};
      for (const card of document.querySelectorAll('[data-section]')) {
        const h = card.querySelector('.ps-header');
        const body = card.querySelector('[id^="player-section-body-"]');
        const btn = card.querySelector('.ps-collapse-btn');
        const hr = h.getBoundingClientRect(); const cr = card.getBoundingClientRect();
        secs[card.dataset.section] = {
          cardTop: cr.top, cardBottom: cr.bottom, hTop: hr.top, hBottom: hr.bottom, hHeight: hr.height,
          docked: h.dataset.docked, expanded: btn.getAttribute('aria-expanded'), label: btn.getAttribute('aria-label'),
          rows: body ? body.querySelectorAll('[id^="checkbox-"]').length : 0,
          bodyH: body ? body.getBoundingClientRect().height : 0,
          bodyScroll: body ? [body.scrollHeight, body.clientHeight, body.firstElementChild.scrollHeight, body.firstElementChild.clientHeight] : null,
          bodyTransition: body ? getComputedStyle(body).transitionDuration : null,
          cardOverflow: getComputedStyle(card).overflow,
        };
      }
      const scrollers = [...document.querySelectorAll('[data-section] *')].filter((e) => { const s = getComputedStyle(e); return s.maxHeight === '400px' || ((s.overflowY === 'auto' || s.overflowY === 'scroll') && e.scrollHeight > e.clientHeight); }).length;
      return { barBottom: b.bottom, dockVar: v, scrollY: window.scrollY, maxScroll: document.scrollingElement.scrollHeight - innerHeight, sw: document.scrollingElement.scrollWidth, vw: innerWidth, secs, scrollers };
    });
    // A closed header must sit inside its own card (the round 1 bug put it a dock offset below).
    const closedInCard = (g) => Object.entries(g.secs).filter(([, x]) => x.expanded === 'false').every(([, x]) => Math.abs(x.hTop - x.cardTop) <= 2 && x.hBottom <= x.cardBottom + 1);
    const closedInfo = (g) => Object.fromEntries(Object.entries(g.secs).filter(([, x]) => x.expanded === 'false').map(([k, x]) => [k, { cardTop: x.cardTop, cardBottom: x.cardBottom, hTop: x.hTop, hBottom: x.hBottom }]));
    const scrollIntoSection = async (type, frac) => page.evaluate(([t, f]) => {
      const c = document.querySelector(`[data-section="${t}"]`); const r = c.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + r.top + r.height * f - 300);
    }, [type, frac]);

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#playlist-url-input', { timeout: 30000 }); await settle();
    await page.click('#search-mode-player-btn'); await settle(400);
    await page.fill('#playlist-url-input', QUERY); await page.press('#playlist-url-input', 'Enter');
    await page.waitForFunction(() => document.querySelectorAll('img[src*="a.ppy.sh"]').length > 0, null, { timeout: 30000 }); await settle(1500);
    await page.evaluate(() => { const i = document.querySelector('img[src*="a.ppy.sh"]'); (i.closest('button') || i.parentElement).click(); });
    await page.waitForSelector('[data-section="best"]', { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-section="best"] [id^="checkbox-"]').length > 0, null, { timeout: 30000 }); await settle(1500);
    ok('pick_calls', count().userId === 1 && count().beatmaps === 1, count());

    for (const vp of [{ n: 'desktop', w: 1280, h: 800 }, { n: 'phone', w: 375, h: 812 }]) {
      await page.setViewportSize({ width: vp.w, height: vp.h }); await settle(800);
      const g0 = await geo();
      ok(`${vp.n}_no_inner_scroll`, g0.scrollers === 0, g0.scrollers);
      ok(`${vp.n}_closed_headers_in_card_initial`, closedInCard(g0), closedInfo(g0));
      const best = g0.secs.best;
      ok(`${vp.n}_best_full_length`, best.rows === 25 && best.bodyScroll[0] === best.bodyScroll[1], { rows: best.rows, s: best.bodyScroll });
      ok(`${vp.n}_card_overflow_visible`, best.cardOverflow === 'visible', best.cardOverflow);
      await scrollIntoSection('best', 0.5); await settle(900);
      const g1 = await geo(); R.geo[vp.n + '_mid_best'] = g1;
      ok(`${vp.n}_best_docked`, Math.abs(g1.secs.best.hTop - g1.barBottom) <= 1 && Math.abs(parseFloat(g1.dockVar) - g1.barBottom) <= 1 && g1.secs.best.docked === 'true', { hTop: g1.secs.best.hTop, barBottom: g1.barBottom, v: g1.dockVar });
      ok(`${vp.n}_docked_one_line`, Math.abs(g1.secs.best.hHeight - g0.secs.best.hHeight) <= 1 && g1.secs.best.hHeight < 60, [g0.secs.best.hHeight, g1.secs.best.hHeight]);
      ok(`${vp.n}_no_hscroll`, g1.sw <= g1.vw, [g1.sw, g1.vw]);
      await page.screenshot({ path: path.join(OUT, `${vp.n}_1_best_docked.png`) });

      if (vp.n === 'desktop') {
        const before = count().beatmaps;
        await page.click('[data-section="most_played"] .ps-collapse-btn');
        await page.waitForFunction(() => document.querySelectorAll('[data-section="most_played"] [id^="checkbox-"]').length > 0, null, { timeout: 30000 }); await settle(1200);
        ok('mp_one_call', count().beatmaps === before + 1, count());
      }
      // Boundary: Most Played's card top just under the dock, Best's header pushed out.
      await page.evaluate(() => { const c = document.querySelector('[data-section="most_played"]'); const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--player-dock-top')); window.scrollTo(0, window.scrollY + c.getBoundingClientRect().top - v - 20); });
      await settle(700);
      const g2 = await geo(); R.geo[vp.n + '_boundary'] = g2;
      ok(`${vp.n}_pushed_out`, g2.secs.best.hBottom <= g2.secs.most_played.hTop, { bestBottom: g2.secs.best.hBottom, mpTop: g2.secs.most_played.hTop });
      await page.screenshot({ path: path.join(OUT, `${vp.n}_2_push_boundary.png`) });

      // Deep inside Most Played, collapse from its docked header.
      const c0 = count().total;
      await scrollIntoSection('most_played', 0.8); await settle(700);
      const g3 = await geo();
      ok(`${vp.n}_mp_docked`, g3.secs.most_played.docked === 'true' && Math.abs(g3.secs.most_played.hTop - g3.barBottom) <= 1, g3.secs.most_played);
      await page.screenshot({ path: path.join(OUT, `${vp.n}_3_mp_docked.png`) });
      await page.click('[data-section="most_played"] .ps-collapse-btn'); await settle(900);
      const g4 = await geo(); R.geo[vp.n + '_collapsed'] = g4;
      const mp = g4.secs.most_played;
      ok(`${vp.n}_collapsed_in_view`, mp.expanded === 'false' && mp.rows === 0 && (Math.abs(mp.hTop - g4.barBottom) <= 2 || (g4.scrollY >= g4.maxScroll - 1 && mp.hTop >= g4.barBottom && mp.hBottom <= vp.h)) && mp.label === 'Expand Most Played', { ...mp, barBottom: g4.barBottom, scrollY: g4.scrollY, maxScroll: g4.maxScroll });
      ok(`${vp.n}_closed_headers_in_card_after_collapse`, closedInCard(g4), closedInfo(g4));
      await page.screenshot({ path: path.join(OUT, `${vp.n}_4_collapsed.png`) });
      await page.click('[data-section="most_played"] .ps-collapse-btn'); await settle(900);
      const g5 = await geo();
      ok(`${vp.n}_reopen_no_call`, g5.secs.most_played.rows > 0 && count().total === c0, count());
    }

    await page.setViewportSize({ width: 1280, height: 800 }); await settle(600);
    const c1 = count().total;
    await page.evaluate(() => { const b = [...document.querySelectorAll('[data-section="best"] button')].find((e) => /^Show more/.test(e.innerText.trim())); b.scrollIntoView({ block: 'center' }); b.click(); });
    await settle(900);
    const g6 = await geo();
    ok('show_more_50_no_call', g6.secs.best.rows === 50 && count().total === c1, { rows: g6.secs.best.rows, c: count() });

    await page.emulateMedia({ reducedMotion: 'reduce' }); await settle(500);
    const g7 = await geo();
    ok('reduced_motion_transition', g7.secs.best.bodyTransition === '0s', g7.secs.best.bodyTransition);
    ok('final_calls', count().q === 1 && count().userId === 1 && count().beatmaps === 2, count());
    R.calls = calls;
    await ctx.close();
  } catch (e) { R.error = String(e && e.stack || e); R.calls = calls; }
  await browser.close(); clearTimeout(hard);
  fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(R, null, 2));
  const fails = Object.entries(R.checks).filter(([, v]) => !v.pass).map(([k, v]) => k + ' ' + JSON.stringify(v.detail));
  console.log(R.error ? 'ERROR ' + R.error : '');
  console.log(fails.length ? 'FAIL\n' + fails.join('\n') : `ALL PASS (${Object.keys(R.checks).length})`);
  console.log(JSON.stringify({ calls: R.calls, log: R.log }, null, 1));
})();
