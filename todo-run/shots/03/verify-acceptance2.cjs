// Verifier round 1, pass 2: alt picker, mid play buffering/error, phone. The /api/osu/search
// response is cached to search-cache.json so any rerun makes no osu! call at all.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const BASE = 'http://localhost:3000';
const PREVIEW = '**/b.ppy.sh/preview/**';
const CACHE = path.join(OUT, 'search-cache.json');
const R = {};
const log = [];
const previewReqs = [];

const state = (h) => h.evaluate((el) => ({
  label: el.getAttribute('aria-label'),
  spinner: !!el.querySelector('svg.spin-slow'),
  bars: el.querySelectorAll('.osu-wave-bar').length,
  playIcon: !!el.querySelector('svg.lucide-play'),
}));
const tagOf = (s) => (s.spinner ? 'S' : s.bars ? 'B' : s.playIcon ? 'P' : '?');
const unavailable = (page) => page.locator('text=Preview unavailable').evaluateAll(
  (els) => els.filter((e) => e.offsetParent !== null).length);

async function watch(h, ms, stopWhen) {
  const tl = []; const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await state(h); const tag = tagOf(s);
    if (tl[tl.length - 1]?.tag !== tag) tl.push({ t: Date.now() - t0, tag, label: s.label });
    if (stopWhen && stopWhen(tl)) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  return tl;
}

(async () => {
  const kill = setTimeout(() => { fs.writeFileSync(path.join(OUT, 'verify2-results.json'), JSON.stringify(R, null, 2)); console.error('hard timeout'); process.exit(2); }, 200000);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => {
    const Orig = window.Audio;
    window.Audio = function (...a) { const el = new Orig(...a); window.__previewAudio = el; return el; };
    window.Audio.prototype = Orig.prototype;
  });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  page.on('request', (q) => { if (q.url().includes('b.ppy.sh/preview')) previewReqs.push(q.url()); });
  page.on('response', async (res) => {
    if (res.url().includes('b.ppy.sh/preview')) R.previewHeaders = { len: res.headers()['content-length'], type: res.headers()['content-type'] };
  });
  if (fs.existsSync(CACHE)) {
    const cached = fs.readFileSync(CACHE, 'utf8');
    await page.route('**/api/osu/search**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: cached }));
    R.search = 'cached';
  } else {
    page.on('response', async (res) => {
      if (res.url().includes('/api/osu/search') && res.status() === 200) fs.writeFileSync(CACHE, await res.text());
    });
    R.search = 'live';
  }

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

  const row = await page.$('.osu-play-btn:visible');

  // A. Mid play, real media events from the real element: start normally, then fire the
  // element's own waiting / playing, then an error on the element.
  await row.click();
  R.A_start = await watch(row, 8000, (tl) => tl.some((x) => x.tag === 'B'));
  await page.evaluate(() => window.__previewAudio.dispatchEvent(new Event('waiting')));
  await page.waitForTimeout(250);
  R.A_afterWaiting = await state(row);
  await page.screenshot({ path: path.join(OUT, 'v2_midplay_waiting_desktop.png') });
  await page.evaluate(() => window.__previewAudio.dispatchEvent(new Event('playing')));
  await page.waitForTimeout(250);
  R.A_afterPlaying = await state(row);
  // stalled while data is buffered must not show the spinner (readyState guard)
  R.A_readyState = await page.evaluate(() => window.__previewAudio.readyState);
  await page.evaluate(() => window.__previewAudio.dispatchEvent(new Event('stalled')));
  await page.waitForTimeout(250);
  R.A_afterStalledBuffered = await state(row);
  // Real post start failure: point the playing element at a src that fails. The handler set
  // for this attempt is still bound to the original key, so this exercises onerror -> fail.
  await page.route('**/b.ppy.sh/preview/verifier-broken.mp3', (r) => r.abort('failed'));
  await page.evaluate(() => { const a = window.__previewAudio; a.src = 'https://b.ppy.sh/preview/verifier-broken.mp3'; a.play().catch(() => {}); });
  await page.waitForTimeout(1500);
  R.A_afterMidplayError = { ...(await state(row)), unavailableText: await unavailable(page), paused: await page.evaluate(() => window.__previewAudio.paused) };
  await page.screenshot({ path: path.join(OUT, 'v2_midplay_error_desktop.png') });

  // B. Genuine network run dry: throttle, start, watch for bars then spinner.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: 9000, uploadThroughput: 100000 });
  await row.click(); // retry from error state
  R.B_retryClearsText = await unavailable(page);
  R.B_timeline = await watch(row, 45000, (tl) => {
    const i = tl.findIndex((x) => x.tag === 'B');
    return i >= 0 && tl.slice(i).some((x) => x.tag !== 'B');
  });
  await page.screenshot({ path: path.join(OUT, 'v2_throttled_desktop.png') });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const sB = await state(row);
  if (sB.bars || sB.spinner) { await row.click(); await page.waitForTimeout(300); }

  // C. Alt picker: stable handle, delayed then aborted.
  const alt = await page.$('button:has-text("versions available")');
  if (alt) {
    await alt.click();
    await page.waitForTimeout(700);
    const handles = await page.$$('.osu-play-btn:visible, button[aria-label]:visible');
    const covers = [];
    for (const h of handles) {
      const l = await h.getAttribute('aria-label');
      if (l === 'Play audio preview' || l === 'Preview unavailable') covers.push(h);
    }
    const target = covers[covers.length - 1];
    R.C_count = covers.length;
    R.C_before = await state(target);
    await page.route(PREVIEW, (r) => setTimeout(() => r.abort('failed').catch(() => {}), 2500));
    await target.click();
    await page.waitForTimeout(400);
    R.C_loading = await state(target);
    await page.screenshot({ path: path.join(OUT, 'v2_alt_loading_desktop.png') });
    await page.waitForTimeout(3200);
    R.C_error = await state(target);
    await page.screenshot({ path: path.join(OUT, 'v2_alt_error_desktop.png') });
    await page.unroute(PREVIEW);
    // close via the modal X (the button just after the header)
    await page.locator('h3:has-text("Select Beatmap Version")').locator('xpath=../..').locator('button').first().click();
    await page.waitForTimeout(500);
    R.C_modalClosed = !(await page.$('h3:has-text("Select Beatmap Version")'));
  } else R.C = 'no alternatives offered';

  // D. Phone: loading and error.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(800);
  const card = await page.$('.osu-play-btn:visible');
  await card.scrollIntoViewIfNeeded();
  await page.route(PREVIEW, (r) => setTimeout(() => r.continue().catch(() => {}), 3000));
  await card.click();
  await page.waitForTimeout(400);
  R.D_loading = await state(card);
  await page.screenshot({ path: path.join(OUT, 'v2_loading_phone.png') });
  R.D_tl = await watch(card, 15000, (tl) => tl.some((x) => x.tag === 'B'));
  await page.screenshot({ path: path.join(OUT, 'v2_playing_phone.png') });
  await card.click();
  await page.waitForTimeout(300);
  await page.unroute(PREVIEW);
  await page.route(PREVIEW, (r) => r.abort('failed'));
  await card.click();
  await page.waitForTimeout(1500);
  R.D_error = { ...(await state(card)), unavailableText: await unavailable(page) };
  await page.screenshot({ path: path.join(OUT, 'v2_error_phone.png') });
  await page.unroute(PREVIEW);

  R.previewRequests = previewReqs.length;
  fs.writeFileSync(path.join(OUT, 'verify2-results.json'), JSON.stringify(R, null, 2));
  fs.writeFileSync(path.join(OUT, 'verify2-console.txt'), log.join('\n') + '\n');
  console.log(JSON.stringify(R, null, 2));
  console.log('console:\n' + log.join('\n'));
  await browser.close();
  clearTimeout(kill);
})().catch((e) => { console.error(e); fs.writeFileSync(path.join(OUT, 'verify2-results.json'), JSON.stringify(R, null, 2)); process.exit(1); });
