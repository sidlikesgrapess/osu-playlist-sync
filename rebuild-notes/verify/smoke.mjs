// Phase 3 verification smoke test. Drives production `next start` (port 3108)
// with headless Chromium via Playwright. Ad hoc verify script, not part of src/test/bench.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3108';
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'rebuild-notes', 'verify');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const DESKTOP_VP = { width: 1280, height: 800 };
const PHONE_VP = { width: 375, height: 812 };
const HYDRATION_MS = 900;

const NETLOG = path.join(OUT, 'network-log.txt');
const CONSOLELOG = path.join(OUT, 'console-log.txt');
fs.writeFileSync(NETLOG, '');
fs.writeFileSync(CONSOLELOG, '');

function logLine(stream, s) {
  fs.appendFileSync(stream, s + '\n');
}

const results = { scrollChecks: {}, cspViolations: {}, downloads: [], consoleErrorCount: 0, pageErrorCount: 0 };

function attachPageListeners(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      results.consoleErrorCount += msg.type() === 'error' ? 1 : 0;
      logLine(CONSOLELOG, `console.${msg.type()}: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    results.pageErrorCount += 1;
    logLine(CONSOLELOG, `PAGEERROR: ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    logLine(NETLOG, `REQFAILED ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
  });
  page.on('response', (res) => {
    try {
      const req = res.request();
      const size = res.headers()['content-length'] || '';
      logLine(NETLOG, `${res.status()} ${req.resourceType()} ${req.url()} len=${size}`);
    } catch (e) {
      logLine(NETLOG, `response-log-error ${e.message}`);
    }
  });
}

async function checkScroll(page) {
  return await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    ok: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  }));
}

async function cspViolations(page) {
  return await page.evaluate(() => window.__cspViolations || []);
}

// Capture desktop (assumes current viewport is desktop), then resize to phone and
// capture again, then restore desktop viewport. Avoids any re-fetch: same page, same data.
async function captureBoth(page, name) {
  await page.screenshot({ path: path.join(OUT, `desktop_${name}.png`), fullPage: true });
  results.scrollChecks[`desktop_${name}`] = await checkScroll(page);
  results.cspViolations[`desktop_${name}`] = await cspViolations(page);

  await page.setViewportSize(PHONE_VP);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `phone_${name}.png`), fullPage: true });
  results.scrollChecks[`phone_${name}`] = await checkScroll(page);
  results.cspViolations[`phone_${name}`] = await cspViolations(page);

  await page.setViewportSize(DESKTOP_VP);
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({ viewport: DESKTOP_VP, acceptDownloads: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push({
        violatedDirective: e.violatedDirective,
        blockedURI: e.blockedURI,
        sourceFile: e.sourceFile,
        lineNumber: e.lineNumber,
      });
    });
  });
  attachPageListeners(page);

  // --- Load ---
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 20000 });
  await page.waitForTimeout(HYDRATION_MS);

  // --- Flow 1: playlist / short single-video "playlist" search ---
  await page.fill('#playlist-url-input', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForSelector('#select-all-header-checkbox', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await captureBoth(page, '1_playlist_search');

  // --- Flow 2: text search ---
  await page.click('#platform-dropdown-btn');
  await page.waitForTimeout(300);
  await page.click('text=Single Song Search');
  await page.fill('#playlist-url-input', 'YOASOBI - Idol');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForSelector('#select-all-header-checkbox', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await captureBoth(page, '2_text_search');

  // --- Flow 4: single download from this table ---
  const dlButton = page.locator('button[title="Download .osz file"]').first();
  const hasBtn = await dlButton.count();
  if (hasBtn > 0) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      dlButton.click(),
    ]);
    const savePath = path.join(OUT, 'single-download.osz');
    await download.saveAs(savePath);
    results.downloads.push({ flow: 'single', path: savePath, suggestedFilename: download.suggestedFilename(), url: download.url() });
  } else {
    results.downloads.push({ flow: 'single', error: 'no download button found (no matched beatmap in results)' });
  }
  await page.waitForTimeout(1500);
  await captureBoth(page, '4_single_download');

  // --- Flow 5: batch download of the 2 rows now in the table ---
  // Matched rows auto-select (isAutoSelectable), so both rows are already checked;
  // only click checkboxes if nothing is selected yet.
  const checkboxes = page.locator('[id^="checkbox-song-"]');
  const rowCount = await checkboxes.count();
  const downloadBtnCheck = page.getByRole('button', { name: /^Download/ }).first();
  const initiallyDisabled = await downloadBtnCheck.isDisabled().catch(() => true);
  let toSelect = 0;
  if (initiallyDisabled && rowCount > 0) {
    toSelect = Math.min(2, rowCount);
    for (let i = 0; i < toSelect; i++) {
      await checkboxes.nth(i).click();
      await page.waitForTimeout(200);
    }
  } else {
    toSelect = rowCount; // already selected
  }
  results.downloads.push({ flow: 'batch_select_count', rowCount, toSelect, initiallyDisabled });

  if (toSelect >= 1) {
    const batchDownloads = [];
    const onDl = (d) => batchDownloads.push(d);
    page.on('download', onDl);
    const downloadBtn = page.getByRole('button', { name: /^Download/ }).first();
    await downloadBtn.click();
    await page.waitForTimeout(7000);
    page.off('download', onDl);
    for (let i = 0; i < batchDownloads.length; i++) {
      const d = batchDownloads[i];
      const savePath = path.join(OUT, `batch-download-${i + 1}.osz`);
      await d.saveAs(savePath);
      results.downloads.push({ flow: 'batch', index: i, path: savePath, url: d.url() });
    }
    await captureBoth(page, '5_batch_download');

    // --- Flow 6: ZIP download of the same 2 selected ---
    const zipDlPromise = page.waitForEvent('download', { timeout: 30000 });
    const zipBtn = page.getByRole('button', { name: /ZIP/ }).first();
    await zipBtn.click();
    const zipDownload = await zipDlPromise;
    const zipPath = path.join(OUT, 'zip-download.zip');
    await zipDownload.saveAs(zipPath);
    results.downloads.push({ flow: 'zip', path: zipPath, url: zipDownload.url() });
    await page.waitForTimeout(2000);
    await captureBoth(page, '6_zip_download');
  }

  // --- Flow 3: player lookup ---
  await page.click('#platform-dropdown-btn');
  await page.waitForTimeout(300);
  await page.click('text=Player Search (osu! profile)');
  await page.fill('#playlist-url-input', '2');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForTimeout(3500);
  const sectionHeader = page.locator('text=Most Played').first();
  await sectionHeader.click({ timeout: 15000 }).catch((e) => logLine(CONSOLELOG, `most-played click failed: ${e.message}`));
  await page.waitForTimeout(2500);
  await captureBoth(page, '3_player_lookup');

  await context.close();
  await browser.close();

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log('DONE');
  console.log(JSON.stringify(results, null, 2));
})().catch((err) => {
  console.error('SMOKE FAILED', err && err.stack || err);
  process.exit(1);
});
