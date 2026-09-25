// Item 12 VERIFIER: collapse landing diagnostics with every /api/osu call MOCKED (no live
// osu! traffic, images from ppy.sh blocked). Run: NODE_PATH="$(npm root -g)" node todo-run/shots/12/verify-collapse-mock.cjs
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';

const set = (i) => ({ id: 1000 + i, title: `Song ${i}`, titleUnicode: `Song ${i}`, artist: `Artist ${i}`, artistUnicode: `Artist ${i}`,
  creator: 'mapper', creatorId: 1, status: 'ranked', bpm: 180, covers: { list: '', card: '', cover: '', slimcover: '' },
  favouriteCount: 1, playCount: 1, previewUrl: '', difficulties: [{ id: 5000 + i, difficultyRating: 6.2, version: 'Hard', mode: 'osu', bpm: 180, totalLength: 120 }],
  starRange: { min: 6.2, max: 6.2 } });
const items = (type, n) => Array.from({ length: n }, (_, i) => ({ beatmapset: set(i + (type === 'best' ? 0 : type === 'most_played' ? 200 : 400)), meta: type === 'best' ? { pp: 500, rank: 'S', accuracy: 98, mods: [] } : { playCount: 10 } }));

(async () => {
  const hard = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 200000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const R = { cases: {} };
  const live = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route(/ppy\.sh/, (r) => r.abort());
    await ctx.route('**/api/osu/**', (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === '/api/osu/player/beatmaps') {
        const t = u.searchParams.get('type'); const it = items(t, 100);
        return route.fulfill({ json: { type: t, items: it, fetched: 100, total: 100 } });
      }
      if (u.pathname === '/api/osu/player' && u.searchParams.get('q')) return route.fulfill({ json: { type: 'results', users: [{ id: 42, username: 'mockuser', avatarUrl: 'https://a.ppy.sh/42', countryCode: 'US', isSupporter: false }], total: 1, page: 1 } });
      if (u.pathname === '/api/osu/player') return route.fulfill({ json: { type: 'profile', user: { id: 42, username: 'mockuser', avatarUrl: 'https://a.ppy.sh/42', countryCode: 'US', isSupporter: false, coverUrl: null, globalRank: 1, countryRank: 1, pp: 1, playCount: 1, counts: { best: 100, most_played: 100, favourite: 100 } } } });
      live.push(u.href); return route.abort();
    });
    const page = await ctx.newPage();
    const G = (t) => page.evaluate((type) => { const c = document.querySelector(`[data-section="${type}"]`); const h = c.querySelector('.ps-header').getBoundingClientRect();
      return { hT: h.top, sy: scrollY, max: document.scrollingElement.scrollHeight - innerHeight, dock: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--player-dock-top')), anchor: getComputedStyle(document.scrollingElement).overflowAnchor }; }, t);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#playlist-url-input'); await page.waitForTimeout(800);
    await page.click('#search-mode-player-btn'); await page.waitForTimeout(300);
    await page.fill('#playlist-url-input', 'mockuser'); await page.press('#playlist-url-input', 'Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /mockuser/.test(b.textContent)), null, { timeout: 20000 });
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /mockuser/.test(b.textContent) && !b.querySelector('input')).click());
    await page.waitForFunction(() => document.querySelectorAll('[data-section="best"] [id^="checkbox-"]').length > 0, null, { timeout: 20000 });
    await page.waitForTimeout(1000);
    // Open MP and Favourites so lots of content sits below Best.
    for (const t of ['most_played', 'favourite']) { await page.click(`[data-section="${t}"] .ps-collapse-btn`); await page.waitForFunction((tt) => document.querySelectorAll(`[data-section="${tt}"] [id^="checkbox-"]`).length > 0, t); await page.waitForTimeout(600); }

    const collapseCase = async (name, type, frac) => {
      await page.evaluate(([t, f]) => { const c = document.querySelector(`[data-section="${t}"]`); const r = c.getBoundingClientRect(); window.scrollTo(0, scrollY + r.top + r.height * f - 300); }, [type, frac]);
      await page.waitForTimeout(600);
      if (process.env.NOANCHOR) await page.addStyleTag({ content: 'html,body,*{overflow-anchor:none !important}' });
      await page.evaluate((t) => { window.__calls = []; if (!window.__wrapped) { window.__wrapped = 1; const o = window.scrollTo.bind(window); window.scrollTo = (...a) => { const c = document.querySelector(`[data-section="${window.__t}"]`); window.__calls.push({ a: JSON.stringify(a), sy: scrollY, cardTop: c.getBoundingClientRect().top, var: getComputedStyle(document.documentElement).getPropertyValue('--player-dock-top') }); return o(...a); }; } window.__t = t; }, type);
      await page.evaluate(() => { window.__sl = []; window.addEventListener('scroll', () => window.__sl.push(Math.round(scrollY)), { passive: true }); });
      const before = await G(type);
      if (process.env.JSCLICK) await page.evaluate((t) => document.querySelector(`[data-section="${t}"] .ps-collapse-btn`).click(), type);
      else await page.click(`[data-section="${type}"] .ps-collapse-btn`);
      const mid = []; for (let i = 0; i < 8; i++) { await page.waitForTimeout(50); mid.push(Math.round((await G(type)).hT)); }
      await page.waitForTimeout(400);
      const after = await G(type);
      await page.screenshot({ path: path.join(OUT, `vm_${name}${process.env.JSCLICK ? '_js' : ''}${process.env.NOANCHOR ? '_na' : ''}.png`) });
      R.cases[name] = { before, mid, after, scrollLog: (await page.evaluate(() => window.__sl)).slice(0,10), stCalls: await page.evaluate(() => window.__calls), landedAtDock: Math.abs(after.hT - after.dock) <= 1 };
      console.log(name, JSON.stringify(R.cases[name]));
      await page.click(`[data-section="${type}"] .ps-collapse-btn`); await page.waitForTimeout(800);
    };
    await collapseCase('desktop_best_with_content_below', 'best', 0.6);
    await collapseCase('desktop_mp_with_content_below', 'most_played', 0.6);
    await collapseCase('desktop_fav_last', 'favourite', 0.6);
    await page.setViewportSize({ width: 375, height: 812 }); await page.waitForTimeout(800);
    await collapseCase('phone_best_with_content_below', 'best', 0.6);
    await collapseCase('phone_fav_last', 'favourite', 0.6);
  } catch (e) { R.error = String(e.stack || e); console.error(e); }
  finally { R.unmockedOsu = live; fs.writeFileSync(path.join(OUT, 'verify-collapse-mock-results' + (process.env.JSCLICK ? '-js' : '') + (process.env.NOANCHOR ? '-noanchor' : '') + '.json'), JSON.stringify(R, null, 2)); clearTimeout(hard); await browser.close(); }
})();
