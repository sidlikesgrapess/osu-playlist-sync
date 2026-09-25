// Verifier (acceptance lens) for todo 03. One text search, reused for every check.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const BASE = 'http://localhost:3000';
const PREVIEW = '**/b.ppy.sh/preview/**';
const R = {};
const log = [];
let previewFetches = 0;

const state = (loc) => loc.evaluate((el) => ({
  label: el.getAttribute('aria-label'),
  title: el.getAttribute('title'),
  spinner: !!el.querySelector('svg.spin-slow'),
  spinnerColor: el.querySelector('svg.spin-slow')?.getAttribute('stroke') || null,
  spinnerSize: el.querySelector('svg.spin-slow')?.getAttribute('width') || null,
  bars: el.querySelectorAll('.osu-wave-bar').length,
  playIcon: !!el.querySelector('svg.lucide-play'),
  bg: el.style.background,
}));
const unavailable = (page) => page.locator('text=Preview unavailable').evaluateAll(
  (els) => els.filter((e) => e.offsetParent !== null).length);

async function viewport(page, name, cdp) {
  const btn = page.locator('.osu-play-btn:visible').first();
  await btn.scrollIntoViewIfNeeded();
  R[`${name}_idle`] = await state(btn);

  // Loading: hold 3 s. Check at 400 ms, then click while buffering stops it.
  await page.route(PREVIEW, (r) => { previewFetches++; setTimeout(() => r.continue().catch(() => {}), 3000); });
  await btn.click();
  await page.waitForTimeout(400);
  R[`${name}_loading`] = await state(btn);
  await page.screenshot({ path: path.join(OUT, `v_loading_${name}.png`) });
  await btn.click(); // stop while buffering
  await page.waitForTimeout(300);
  R[`${name}_stoppedWhileLoading`] = await state(btn);

  // Loading then playing.
  await btn.click();
  await page.waitForTimeout(400);
  R[`${name}_loading2`] = await state(btn);
  await page.waitForFunction(() => !!document.querySelector('.osu-play-btn .osu-wave-bar'), null, { timeout: 15000 }).catch(() => {});
  R[`${name}_playing`] = await state(btn);
  await page.screenshot({ path: path.join(OUT, `v_playing_${name}.png`) });
  await btn.click();
  await page.waitForTimeout(300);
  await page.unroute(PREVIEW);

  // Error on start.
  await page.route(PREVIEW, (r) => { previewFetches++; r.abort('failed'); });
  await btn.click();
  await page.waitForTimeout(1500);
  R[`${name}_error`] = { ...(await state(btn)), unavailableText: await unavailable(page) };
  await page.screenshot({ path: path.join(OUT, `v_error_${name}.png`) });
  await page.unroute(PREVIEW);

  if (name !== 'desktop') return;

  // Retry clears the error (normal network, cache disabled so it really fetches).
  page.on('request', (q) => { if (q.url().includes('b.ppy.sh/preview')) previewFetches++; });
  await btn.click();
  await page.waitForTimeout(300);
  R[`${name}_retryImmediate`] = { ...(await state(btn)), unavailableText: await unavailable(page) };
  await page.waitForFunction(() => !!document.querySelector('.osu-play-btn .osu-wave-bar'), null, { timeout: 15000 }).catch(() => {});
  R[`${name}_retryPlaying`] = { ...(await state(btn)), unavailableText: await unavailable(page) };
  await btn.click();
  await page.waitForTimeout(300);

  // Mid play buffering: throttle to ~4 KB/s (below 128 kbps playback), no route.
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: 4000, uploadThroughput: 100000 });
  await btn.click();
  const timeline = [];
  const t0 = Date.now();
  let sawBarsThenSpinner = false, sawBars = false;
  while (Date.now() - t0 < 25000) {
    const s = await state(btn);
    const tag = s.spinner ? 'S' : s.bars ? 'B' : s.playIcon ? 'P' : '?';
    if (timeline[timeline.length - 1]?.tag !== tag) timeline.push({ t: Date.now() - t0, tag });
    if (tag === 'B') sawBars = true;
    if (sawBars && tag === 'S' && !sawBarsThenSpinner) {
      sawBarsThenSpinner = true;
      await page.screenshot({ path: path.join(OUT, `v_midplay_buffering_${name}.png`) });
      break;
    }
    await page.waitForTimeout(150);
  }
  R.midplayTimeline = timeline;
  R.midplaySawBarsThenSpinner = sawBarsThenSpinner;

  // Mid play failure: go offline while the file is still downloading.
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const t1 = Date.now();
  const tl2 = [];
  while (Date.now() - t1 < 25000) {
    const s = await state(btn);
    const tag = s.spinner ? 'S' : s.bars ? 'B' : s.playIcon ? 'P' : '?';
    if (tl2[tl2.length - 1]?.tag !== tag) tl2.push({ t: Date.now() - t1, tag, label: s.label });
    if (tag === 'P') break;
    await page.waitForTimeout(250);
  }
  R.offlineTimeline = tl2;
  R.offlineFinal = { ...(await state(btn)), unavailableText: await unavailable(page) };
  await page.screenshot({ path: path.join(OUT, `v_midplay_offline_${name}.png`) });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const cur = await state(btn);
  if (cur.bars || cur.spinner) { await btn.click(); await page.waitForTimeout(300); }

  // Alt picker, if the row offers alternatives: spinner and error inside the modal.
  const alt = page.locator('button:has-text("versions available")').first();
  if (await alt.count()) {
    await alt.click();
    await page.waitForTimeout(600);
    const modalBtns = page.locator('button[aria-label="Play audio preview"]:visible, button[aria-label="Preview unavailable"]:visible');
    const n = await modalBtns.count();
    const target = modalBtns.nth(n - 1);
    await page.route(PREVIEW, (r) => { setTimeout(() => r.abort('failed'), 2500); });
    await target.click();
    await page.waitForTimeout(400);
    R.altLoading = await state(target);
    await page.screenshot({ path: path.join(OUT, `v_alt_loading_${name}.png`) });
    await page.waitForTimeout(3000);
    R.altError = await state(target);
    await page.screenshot({ path: path.join(OUT, `v_alt_error_${name}.png`) });
    await page.unroute(PREVIEW);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } else R.alt = 'no alternatives offered';
}

(async () => {
  const kill = setTimeout(() => { console.error('hard timeout'); fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(R, null, 2)); process.exit(2); }, 170000);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const cdp = await page.context().newCDPSession(page);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.click('#platform-dropdown-btn');
  await page.waitForTimeout(300);
  await page.click('text=Single Song Search');
  await page.fill('#playlist-url-input', 'YOASOBI - Idol');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForSelector('.osu-play-btn', { timeout: 30000 });
  await page.waitForTimeout(1500);

  await viewport(page, 'desktop', cdp);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(800);
  await viewport(page, 'phone', cdp);

  R.previewFetches = previewFetches;
  fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(R, null, 2));
  fs.writeFileSync(path.join(OUT, 'verify-console.txt'), log.join('\n') + '\n');
  console.log(JSON.stringify(R, null, 2));
  console.log('console lines:\n' + log.join('\n'));
  await browser.close();
  clearTimeout(kill);
})().catch((e) => { console.error(e); fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(R, null, 2)); process.exit(1); });
