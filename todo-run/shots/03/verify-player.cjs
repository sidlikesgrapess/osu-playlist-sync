// Verifier: PlayerSections BeatmapRow preview states. Player routes are mocked from
// search-cache.json, so this run makes no osu! API call. Previews are real (b.ppy.sh).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const PREVIEW = '**/b.ppy.sh/preview/**';
const cache = JSON.parse(fs.readFileSync(path.join(OUT, 'search-cache.json'), 'utf8'));
const sets = cache.beatmapsets.filter((s) => s.status === 'ranked').slice(0, 3);
const user = { id: 424242, username: 'verifier', avatarUrl: null, countryCode: 'JP', coverUrl: null,
  globalRank: 1, countryRank: 1, pp: 1000, playCount: 10, counts: { best: sets.length, most_played: 0, favourite: 0 } };
const R = {}; const log = [];

const state = (h) => h.evaluate((el) => ({
  label: el.getAttribute('aria-label'),
  spinner: !!el.querySelector('svg.spin-slow'),
  bars: el.querySelectorAll('.osu-wave-bar').length,
  playIcon: !!el.querySelector('svg.lucide-play'),
}));
const unavailable = (page) => page.locator('text=Preview unavailable').evaluateAll(
  (els) => els.filter((e) => e.offsetParent !== null).length);

async function run(browser, name, viewport) {
  const page = await browser.newPage({ viewport });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`[${name}][${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => log.push(`[${name}][pageerror] ${e.message}`));
  await page.route('**/api/osu/player/beatmaps**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ type: 'best', items: sets.map((s) => ({ beatmapset: s, meta: { pp: 500, rank: 'S', accuracy: 99.1, mods: [] } })), fetched: sets.length, total: sets.length }) }));
  await page.route(/\/api\/osu\/player\?/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'profile', user }) }));
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.click('#platform-dropdown-btn');
  await page.waitForTimeout(300);
  await page.click('text=Player Search (osu! profile)');
  await page.fill('#playlist-url-input', 'verifier');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForSelector('button[aria-label="Play audio preview"]', { timeout: 20000 });
  await page.waitForTimeout(1200);
  const btns = await page.$$('button[aria-label="Play audio preview"]:visible');
  R[`${name}_rows`] = btns.length;
  const a = btns[0]; const b = btns[1] || btns[0];
  await a.scrollIntoViewIfNeeded();

  await page.route(PREVIEW, (r) => setTimeout(() => r.continue().catch(() => {}), 3000));
  await a.click();
  await page.waitForTimeout(400);
  R[`${name}_loading`] = await state(a);
  await page.screenshot({ path: path.join(OUT, `vp_loading_${name}.png`) });
  await page.waitForFunction(() => !!document.querySelector('.osu-wave-bar'), null, { timeout: 15000 }).catch(() => {});
  R[`${name}_playing`] = await state(a);
  await page.unroute(PREVIEW);

  // Error on a second row while the first is playing: first row stops, second flags.
  await page.route(PREVIEW, (r) => r.abort('failed'));
  await b.click();
  await page.waitForTimeout(1500);
  R[`${name}_error`] = { ...(await state(b)), first: await state(a), unavailableText: await unavailable(page) };
  await page.screenshot({ path: path.join(OUT, `vp_error_${name}.png`) });
  await page.unroute(PREVIEW);
  await page.close();
}

(async () => {
  const kill = setTimeout(() => { fs.writeFileSync(path.join(OUT, 'verify-player-results.json'), JSON.stringify(R, null, 2)); process.exit(2); }, 120000);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  await run(browser, 'desktop', { width: 1280, height: 800 });
  await run(browser, 'phone', { width: 375, height: 812 });
  fs.writeFileSync(path.join(OUT, 'verify-player-results.json'), JSON.stringify(R, null, 2));
  fs.writeFileSync(path.join(OUT, 'verify-player-console.txt'), log.join('\n') + '\n');
  console.log(JSON.stringify(R, null, 2)); console.log(log.join('\n'));
  await browser.close(); clearTimeout(kill);
})().catch((e) => { console.error(e); fs.writeFileSync(path.join(OUT, 'verify-player-results.json'), JSON.stringify(R, null, 2)); process.exit(1); });
