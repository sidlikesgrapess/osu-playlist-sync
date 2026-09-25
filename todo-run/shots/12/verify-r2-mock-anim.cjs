// Item 12 verify round 2: animation checks with every /api/osu call MOCKED (no live osu! traffic).
// Run: NODE_PATH="$(npm root -g)" node todo-run/shots/12/verify-r2-mock-anim.cjs
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const BASE = 'http://localhost:3000';
const set = (i) => ({ id: 1000 + i, title: `Song ${i}`, titleUnicode: `Song ${i}`, artist: `Artist ${i}`, artistUnicode: `Artist ${i}`, creator: 'mapper', creatorId: 1, status: 'ranked', bpm: 180, covers: { list: '', card: '', cover: '', slimcover: '' }, favouriteCount: 1, playCount: 1, previewUrl: '', difficulties: [{ id: 5000 + i, difficultyRating: 6.2, version: 'Hard', mode: 'osu', bpm: 180, totalLength: 120 }], starRange: { min: 6.2, max: 6.2 } });
const items = (type, n) => Array.from({ length: n }, (_, i) => ({ beatmapset: set(i + (type === 'best' ? 0 : type === 'most_played' ? 200 : 400)), meta: type === 'best' ? { pp: 500, rank: 'S', accuracy: 98, mods: [] } : { playCount: 10 } }));
(async () => {
  const hard = setTimeout(() => process.exit(2), 150000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const R = {}; const live = []; const bmCalls = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route(/ppy\.sh/, (r) => r.abort());
    await ctx.route('**/api/osu/**', (route) => { const u = new URL(route.request().url());
      if (u.pathname === '/api/osu/player/beatmaps') { bmCalls.push(u.searchParams.get('type')); const t = u.searchParams.get('type'); return route.fulfill({ json: { type: t, items: items(t, 100), fetched: 100, total: 100 } }); }
      if (u.pathname === '/api/osu/player' && u.searchParams.get('q')) return route.fulfill({ json: { type: 'results', users: [{ id: 42, username: 'mockuser', avatarUrl: 'https://a.ppy.sh/42', countryCode: 'US', isSupporter: false }], total: 1, page: 1 } });
      if (u.pathname === '/api/osu/player') return route.fulfill({ json: { type: 'profile', user: { id: 42, username: 'mockuser', avatarUrl: 'https://a.ppy.sh/42', countryCode: 'US', isSupporter: false, coverUrl: null, globalRank: 1, countryRank: 1, pp: 1, playCount: 1, counts: { best: 100, most_played: 100, favourite: 100 } } } });
      live.push(u.href); return route.abort(); });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#playlist-url-input'); await page.waitForTimeout(800);
    await page.click('#search-mode-player-btn'); await page.waitForTimeout(300);
    await page.fill('#playlist-url-input', 'mockuser'); await page.press('#playlist-url-input', 'Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /mockuser/.test(b.textContent)), null, { timeout: 20000 });
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /mockuser/.test(b.textContent) && !b.querySelector('input')).click());
    await page.waitForFunction(() => document.querySelectorAll('[data-section="best"] [id^="checkbox-"]').length > 0, null, { timeout: 20000 }); await page.waitForTimeout(1000);
    await page.click('[data-section="most_played"] .ps-collapse-btn'); await page.waitForTimeout(1000);
    const sample = (type, action) => page.evaluate(([t, a]) => new Promise((res) => {
      const btn = document.querySelector(`[data-section="${t}"] .ps-collapse-btn`);
      const out = []; const t0 = performance.now();
      const f = () => { const b = document.getElementById(`player-section-body-${t}`); out.push([Math.round(performance.now() - t0), b ? Math.round(b.getBoundingClientRect().height) : 0]); if (performance.now() - t0 < 600) requestAnimationFrame(f); else res(out); };
      btn.click(); requestAnimationFrame(f);
    }), [type, action]);
    // Undocked section (top of page), collapse then reopen Most Played (already loaded).
    await page.evaluate(() => { const c = document.querySelector('[data-section="most_played"]'); window.scrollTo(0, scrollY + c.getBoundingClientRect().top - 400); }); await page.waitForTimeout(500);
    R.collapse = await sample('most_played'); await page.waitForTimeout(300);
    R.reopen = await sample('most_played'); await page.waitForTimeout(300);
    const mids = (s) => { const mx = Math.max(...s.map(x => x[1])); return s.filter(([, h]) => h > 5 && h < mx - 5).length; };
    R.checks = { collapse_intermediate: mids(R.collapse), reopen_intermediate: mids(R.reopen), collapse_ends_0: R.collapse[R.collapse.length - 1][1] === 0 };
    R.checks.collapse_done_ms = (R.collapse.find(([, h]) => h === 0) || [null])[0];
    R.checks.reopen_done_ms = (R.reopen.find(([, h]) => h >= Math.max(...R.reopen.map(x => x[1])) - 1) || [null])[0];
    // Dock tracking measured where the painted frame is settled: in a ResizeObserver created AFTER PlaylistInput's.
    await page.evaluate(() => window.scrollTo(0, 100)); await page.waitForTimeout(700);
    R.track = await page.evaluate(() => new Promise((res) => {
      const bar = document.getElementById('playlist-url-input').closest('div[style*="sticky"]');
      const h = document.querySelector('[data-section="best"] .ps-header'); const card = document.querySelector('[data-section="best"]');
      const out = []; const t0 = performance.now();
      const ro = new ResizeObserver(() => out.push([Math.round(performance.now() - t0), +bar.getBoundingClientRect().bottom.toFixed(1), +h.getBoundingClientRect().top.toFixed(1)])); ro.observe(bar);
      window.scrollTo(0, Math.max(window.scrollY + card.getBoundingClientRect().top - 100, 400));
      setTimeout(() => { ro.disconnect(); res(out); }, 700);
    }));
    R.checks.track_worst = Math.max(...R.track.map(([, b, t]) => Math.abs(b - t))); R.checks.track_frames = R.track.length;
    // Reduced motion: collapse is immediate.
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(400);
    await page.evaluate(() => { const c = document.querySelector('[data-section="most_played"]'); window.scrollTo(0, scrollY + c.getBoundingClientRect().top - 400); }); await page.waitForTimeout(400);
    R.rmCollapse = await sample('most_played'); await page.waitForTimeout(200);
    R.rmReopen = await sample('most_played');
    R.checks.rm_collapse_first_nonzero_frames = R.rmCollapse.filter(([, h]) => h > 0).length;
    R.checks.rm_reopen_intermediate = mids(R.rmReopen);
    R.bmCalls = bmCalls; R.live = live;
    await page.screenshot({ path: path.join(__dirname, 'r2_mock_end.png') });
  } catch (e) { R.error = String(e.stack || e); }
  await browser.close(); clearTimeout(hard);
  fs.writeFileSync(path.join(__dirname, 'verify-r2-mock-anim-results.json'), JSON.stringify(R, null, 1));
  console.log(JSON.stringify({ error: R.error, checks: R.checks, bm: R.bmCalls, live: R.live, rmC: R.rmCollapse && R.rmCollapse.slice(0, 4), col: R.collapse && R.collapse.slice(0, 8), track: R.track && R.track.slice(0, 8) }));
})();
