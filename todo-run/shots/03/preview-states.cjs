// Live check for todo 03: spinner while a preview loads, wave bars once it plays,
// "Preview unavailable" plus the Play icon when the preview request fails.
// One text search (one osu! search) reused for both viewports via setViewportSize.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const BASE = 'http://localhost:3000';
const PREVIEW = '**/b.ppy.sh/preview/**';
const results = {};
const consoleLines = [];

async function btnState(page) {
  const btn = page.locator('.osu-play-btn:visible').first();
  return btn.evaluate((el) => ({
    label: el.getAttribute('aria-label'),
    spinner: !!el.querySelector('svg.spin-slow'),
    bars: el.querySelectorAll('.osu-wave-bar').length,
    playIcon: !!el.querySelector('svg.lucide-play'),
  }));
}

async function unavailableVisible(page) {
  return page.locator('text=Preview unavailable').evaluateAll(
    (els) => els.filter((e) => e.offsetParent !== null).length
  );
}

async function runViewport(page, name) {
  const btn = page.locator('.osu-play-btn:visible').first();
  await btn.scrollIntoViewIfNeeded();

  // Loading path: hold the preview for 4 s.
  await page.route(PREVIEW, (r) => setTimeout(() => r.continue().catch(() => {}), 4000));
  await btn.click();
  await page.waitForTimeout(500);
  results[`${name}_loading`] = await btnState(page);
  await page.screenshot({ path: path.join(OUT, `03_loading_${name}.png`) });

  await page.waitForFunction(
    () => !!document.querySelector('.osu-play-btn .osu-wave-bar'), null, { timeout: 15000 }
  ).catch(() => {});
  results[`${name}_playing`] = await btnState(page);
  await page.screenshot({ path: path.join(OUT, `03_playing_${name}.png`) });
  await btn.click(); // stop
  await page.waitForTimeout(300);
  await page.unroute(PREVIEW);

  // Error path: the preview request fails outright.
  await page.route(PREVIEW, (r) => r.abort('failed'));
  await btn.click();
  await page.waitForTimeout(1500);
  results[`${name}_error`] = { ...(await btnState(page)), unavailableText: await unavailableVisible(page) };
  await page.screenshot({ path: path.join(OUT, `03_error_${name}.png`) });
  await page.unroute(PREVIEW);
}

(async () => {
  const kill = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 120000);
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleLines.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

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

  await runViewport(page, 'desktop');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(800);
  await runViewport(page, 'phone');

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT, 'console.txt'), consoleLines.join('\n') + '\n');
  console.log(JSON.stringify(results, null, 2));
  console.log(`console lines: ${consoleLines.length}`);
  await browser.close();
  clearTimeout(kill);
})().catch((e) => { console.error(e); process.exit(1); });
