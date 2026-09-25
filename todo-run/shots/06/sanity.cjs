// Implement stage sanity check for item 06 (the full verifier comes later). osu! routes are
// mocked, and /api/playlist is mocked for links so no provider is hit. Plain text goes live:
// the query path makes no provider call, and the row search it triggers is mocked.
const { chromium } = require('playwright');
const path = require('path');

const OUT = __dirname;
const R = {}; const log = [];
const ok = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

async function run(browser, name, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const hits = [];
  page.on('pageerror', (e) => log.push(`[${name}][pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') log.push(`[${name}][console] ${m.text()}`); });
  await page.route('**/api/osu/search**', (r) => { hits.push('search:' + new URL(r.request().url()).searchParams.get('source')); r.fulfill(ok({ beatmapsets: [], isDemo: true })); });
  await page.route('**/api/osu/player**', (r) => { hits.push('player'); r.fulfill(ok({ type: 'search', users: [] })); });
  await page.route('**/api/playlist**', (r) => {
    const u = new URL(r.request().url()).searchParams.get('url');
    hits.push('playlist:' + u);
    if (/^https?:/.test(u)) return r.fulfill(ok({ platform: 'mock', title: 'mock', tracks: [] }));
    return r.continue();
  });
  const S = '#search-mode-songs-btn', P = '#search-mode-player-btn', I = '#playlist-url-input';
  const checked = async () => ({ songs: await page.getAttribute(S, 'aria-checked'), player: await page.getAttribute(P, 'aria-checked') });
  const load = async () => { await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' }); await page.waitForSelector(S, { timeout: 20000 }); await page.waitForTimeout(900); };

  await load();
  R[`${name}_old_dropdown`] = await page.locator('#platform-dropdown-btn').count();
  R[`${name}_initial`] = await checked();
  R[`${name}_placeholder_songs`] = await page.getAttribute(I, 'placeholder');
  for (const [v, want] of [['https://open.spotify.com/track/abc', 'spotify'], ['https://youtu.be/x', 'youtube'], ['https://music.apple.com/us/album/1', 'apple'], ['YOASOBI - Idol', 'query'], ['', 'auto']]) {
    await page.fill(I, v);
    R[`${name}_icon_${want}`] = (await page.getAttribute(S, 'data-detected')) === want;
  }
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    inputW: document.querySelector('#playlist-url-input').getBoundingClientRect().width,
    rowTops: ['#search-mode-songs-btn', '#playlist-url-input', '#find-beatmaps-btn'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().top)),
  }));
  R[`${name}_layout`] = layout;
  await page.screenshot({ path: path.join(OUT, `sanity-${name}-idle.png`) });

  // Plain text in Playlist / Song is the old Single Song search.
  hits.length = 0;
  await page.fill(I, 'YOASOBI - Idol');
  const resp = page.waitForResponse((r) => r.url().includes('/api/playlist'), { timeout: 20000 });
  await page.press(I, 'Enter');
  const body = await (await resp).json();
  R[`${name}_query`] = { platform: body.platform, isSingleTrack: body.isSingleTrack };
  await page.waitForTimeout(1500);
  R[`${name}_badge`] = await page.locator('text=Single Song').first().isVisible().catch(() => false);
  R[`${name}_query_hits`] = [...hits];
  await page.screenshot({ path: path.join(OUT, `sanity-${name}-query.png`) });

  // Player mode.
  await load();
  hits.length = 0;
  await page.click(P);
  R[`${name}_after_player_click`] = await checked();
  R[`${name}_placeholder_player`] = await page.getAttribute(I, 'placeholder');
  await page.fill(I, 'mrekk');
  await page.press(I, 'Enter');
  await page.waitForTimeout(1200);
  R[`${name}_player_hits`] = [...hits];
  await page.screenshot({ path: path.join(OUT, `sanity-${name}-player.png`) });

  // Samples sync the toggle.
  for (const id of ['preset-player-mrekk', 'preset-single-song', 'preset-spotify-top', 'preset-youtube-banger']) {
    await load();
    hits.length = 0;
    if (id !== 'preset-player-mrekk') await page.click(P); // start from the other mode
    await page.click('#' + id);
    await page.waitForTimeout(1200);
    R[`${name}_${id}`] = { ...(await checked()), hits: hits.slice(0, 2) };
  }

  // A profile link in Playlist / Song still opens the player.
  await load();
  hits.length = 0;
  await page.fill(I, 'https://osu.ppy.sh/users/2');
  await page.press(I, 'Enter');
  await page.waitForTimeout(1000);
  R[`${name}_profile_link_hits`] = [...hits];

  // Docked bar keeps the toggle.
  await load();
  await page.evaluate(() => { document.body.style.minHeight = '3000px'; window.scrollTo(0, 400); });
  await page.waitForTimeout(600);
  await page.click(P);
  R[`${name}_docked`] = { visible: await page.isVisible(P), ...(await checked()) };
  await page.screenshot({ path: path.join(OUT, `sanity-${name}-docked.png`) });
  await ctx.close();
}

(async () => {
  const kill = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 150000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  try {
    await run(browser, 'desktop', { viewport: { width: 1280, height: 800 } });
    await run(browser, 'phone', { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  } finally { await browser.close(); clearTimeout(kill); }
  console.log(JSON.stringify(R, null, 1));
  console.log(log.join('\n') || 'no page errors');
})();
