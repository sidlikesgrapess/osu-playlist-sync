// Verifier (acceptance lens) for item 06. osu! search/player mocked. /api/playlist goes live
// (samples + plain text), one request per case, paced.
const { chromium } = require('playwright');
const path = require('path');
const OUT = __dirname; const R = {}; const log = [];
const ok = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const PLAYER_PH = 'Type an osu! player name or paste their profile link...';

async function run(browser, name, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const hits = []; const plResp = [];
  page.on('pageerror', (e) => log.push(`[${name}][pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') log.push(`[${name}][console] ${m.text().slice(0, 200)}`); });
  await page.route('**/api/osu/search**', (r) => { hits.push('search:' + new URL(r.request().url()).searchParams.get('source')); r.fulfill(ok({ beatmapsets: [], isDemo: true })); });
  await page.route('**/api/osu/player**', (r) => { hits.push('player:' + r.request().url().split('/api/osu/player')[1].slice(0, 60)); r.fulfill(ok({ type: 'search', users: [] })); });
  page.on('request', (q) => { if (q.url().includes('/api/playlist')) hits.push('playlist:' + new URL(q.url()).searchParams.get('url')); });
  page.on('response', async (r) => {
    if (!r.url().includes('/api/playlist')) return;
    try { const b = await r.json(); plResp.push({ status: r.status(), platform: b.platform, isSingleTrack: b.isSingleTrack, n: (b.tracks || []).length, err: b.error }); }
    catch (e) { plResp.push({ status: r.status(), parse: 'fail' }); }
  });
  const S = '#search-mode-songs-btn', P = '#search-mode-player-btn', I = '#playlist-url-input';
  const checked = async () => ({ songs: await page.getAttribute(S, 'aria-checked'), player: await page.getAttribute(P, 'aria-checked') });
  const load = async () => { await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' }); await page.waitForSelector(S, { timeout: 30000 }); await page.waitForTimeout(1000); };
  const styles = async () => page.evaluate(() => ['#search-mode-songs-btn', '#search-mode-player-btn'].map((s) => { const c = getComputedStyle(document.querySelector(s)); return { bg: c.backgroundColor, color: c.color, border: c.borderColor }; }));

  await load();
  R[`${name}_a_dropdown`] = {
    btn: await page.locator('#platform-dropdown-btn').count(),
    menu: await page.locator('#platform-dropdown-portal-menu').count(),
    radiogroup: await page.locator('[role=radiogroup][aria-label="Search type"]').count(),
    songsVis: await page.isVisible(S), playerVis: await page.isVisible(P),
    songsText: await page.innerText(S), playerText: await page.innerText(P),
  };
  R[`${name}_a_initial`] = await checked();
  R[`${name}_a_styles_songs_active`] = await styles();
  R[`${name}_placeholder_songs`] = await page.getAttribute(I, 'placeholder');
  const icons = {};
  for (const v of ['https://open.spotify.com/track/abc', 'https://www.youtube.com/watch?v=x', 'https://music.apple.com/us/album/1', 'YOASOBI - Idol', 'https://example.com/x', '']) {
    await page.fill(I, v); await page.waitForTimeout(100);
    icons[v || 'EMPTY'] = await page.evaluate(() => {
      const b = document.querySelector('#search-mode-songs-btn'); const ic = b.querySelector('.pi-search-mode-icon');
      return { det: b.dataset.detected, iconDisplay: getComputedStyle(ic).display, svg: ic.innerHTML.slice(0, 90) };
    });
  }
  R[`${name}_icons`] = icons;
  await page.fill(I, 'some text');
  R[`${name}_layout_typed`] = await page.evaluate(() => {
    const q = (s) => document.querySelector(s).getBoundingClientRect();
    const clear = document.querySelector('.pi-clear-btn');
    return {
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, inputW: Math.round(q('#playlist-url-input').width),
      tops: { songs: Math.round(q('#search-mode-songs-btn').top), player: Math.round(q('#search-mode-player-btn').top), input: Math.round(q('#playlist-url-input').top), clear: clear ? Math.round(clear.getBoundingClientRect().top) : null, find: Math.round(q('#find-beatmaps-btn').top) },
      findRight: Math.round(q('#find-beatmaps-btn').right),
    };
  });
  await page.screenshot({ path: path.join(OUT, `va-${name}-typed.png`) });
  await page.fill(I, '');

  // (b) plain text Single Song, live /api/playlist (query path hits no provider)
  hits.length = 0; plResp.length = 0;
  await page.fill(I, 'YOASOBI - Idol');
  await page.press(I, 'Enter');
  await page.waitForResponse((r) => r.url().includes('/api/playlist'), { timeout: 30000 });
  await page.waitForTimeout(2500);
  R[`${name}_b_query`] = { resp: [...plResp], hits: [...hits], badge: await page.locator('text=Single Song').first().isVisible().catch(() => false) };
  R[`${name}_b_placeholder_hasSongs`] = await page.getAttribute(I, 'placeholder');
  await page.screenshot({ path: path.join(OUT, `va-${name}-query.png`) });

  // (d) Player mode
  await load(); hits.length = 0; plResp.length = 0;
  await page.click(P);
  R[`${name}_d_after_click`] = await checked();
  R[`${name}_d_styles_player_active`] = await styles();
  const ph = await page.getAttribute(I, 'placeholder');
  R[`${name}_d_placeholder`] = { got: ph, eq: ph === PLAYER_PH };
  await page.click(S); R[`${name}_d_back_to_songs`] = await checked(); await page.click(P);
  await page.fill(I, 'mrekk'); await page.press(I, 'Enter'); await page.waitForTimeout(1500);
  R[`${name}_d_hits`] = [...hits];
  await page.screenshot({ path: path.join(OUT, `va-${name}-player.png`) });

  // (e) samples, live /api/playlist, paced
  for (const id of ['preset-youtube-banger', 'preset-spotify-top', 'preset-single-song', 'preset-player-mrekk']) {
    await load(); hits.length = 0; plResp.length = 0;
    if (id !== 'preset-player-mrekk') await page.click(P);
    await page.click('#' + id);
    if (id !== 'preset-player-mrekk') await page.waitForResponse((r) => r.url().includes('/api/playlist'), { timeout: 40000 }).catch(() => {});
    await page.waitForTimeout(2500);
    R[`${name}_e_${id}`] = { ...(await checked()), hits: hits.slice(0, 3), resp: [...plResp] };
    await page.screenshot({ path: path.join(OUT, `va-${name}-${id}.png`) });
    await page.waitForTimeout(800);
  }

  // profile link in songs mode
  await load(); hits.length = 0;
  await page.fill(I, 'https://osu.ppy.sh/users/2'); await page.press(I, 'Enter'); await page.waitForTimeout(1200);
  R[`${name}_profile_link`] = [...hits];

  // (f) docked
  await load(); hits.length = 0;
  await page.evaluate(() => { document.body.style.minHeight = '4000px'; });
  await page.evaluate(() => window.scrollTo(0, 400)); await page.waitForTimeout(800);
  const dockInfo = await page.evaluate(() => { const b = document.querySelector('#search-mode-player-btn').getBoundingClientRect(); return { top: Math.round(b.top), inView: b.top >= 0 && b.bottom <= innerHeight, scrollY }; });
  await page.click(P); await page.waitForTimeout(300);
  R[`${name}_f_docked`] = { ...dockInfo, ...(await checked()), sw: await page.evaluate(() => document.documentElement.scrollWidth), placeholder: await page.getAttribute(I, 'placeholder') };
  await page.screenshot({ path: path.join(OUT, `va-${name}-docked.png`) });
  await ctx.close();
}

(async () => {
  const kill = setTimeout(() => { console.error('HARD TIMEOUT'); console.log(JSON.stringify(R, null, 1)); process.exit(2); }, 280000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  try {
    await run(browser, 'desktop', { viewport: { width: 1280, height: 800 } });
    await run(browser, 'phone', { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  } catch (e) { console.error('ERR', e.message); } finally { await browser.close(); clearTimeout(kill); }
  console.log(JSON.stringify(R, null, 1));
  console.log(log.join('\n') || 'no page errors');
})();
