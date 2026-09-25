// Targeted re-check of the ZIP bundle flow only. The first smoke run's captured
// "zip" download turned out (on inspection) to be a stray delayed batch-item
// download event, not the real ZIP bundle -- Playwright's generic
// waitForEvent('download') caught whichever came first. This script isolates
// the ZIP click with its own listener set up only after both songs are matched
// and selected, so nothing else can race it. Two fresh single-song (query-type,
// no provider fetch) searches build a 2-song selection; only the ZIP button is
// clicked (2 archive fetches), nothing else.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3108';
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'rebuild-notes', 'verify');

const NETLOG = path.join(OUT, 'network-log-zipfix.txt');
fs.writeFileSync(NETLOG, '');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
  page.on('response', (res) => {
    const req = res.request();
    fs.appendFileSync(NETLOG, `${res.status()} ${req.resourceType()} ${req.url()} len=${res.headers()['content-length'] || ''}\n`);
  });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 20000 });
  await page.waitForTimeout(900);

  await page.click('#platform-dropdown-btn');
  await page.waitForTimeout(300);
  await page.click('text=Single Song Search');
  await page.fill('#playlist-url-input', 'YOASOBI - Idol');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForSelector('#select-all-header-checkbox', { timeout: 30000 });
  await page.waitForTimeout(2500);

  // Add a second single-song query via the same input (still query-type -> osu search
  // only, no provider fetch).
  await page.fill('#playlist-url-input', 'Rick Astley - Never Gonna Give You Up');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForTimeout(3500);

  const rowCount = await page.locator('[id^="checkbox-song-"]').count();
  const downloadAllBtn = page.getByRole('button', { name: /^Download/ }).first();
  await downloadAllBtn.waitFor({ state: 'visible', timeout: 10000 });
  const btnText = await downloadAllBtn.textContent();

  const zipDlPromise = page.waitForEvent('download', { timeout: 40000 });
  const zipBtn = page.getByRole('button', { name: /ZIP/ }).first();
  await zipBtn.waitFor({ state: 'visible', timeout: 10000 });
  const zipBtnText = await zipBtn.textContent();
  await zipBtn.click();
  const zipDownload = await zipDlPromise;
  const zipPath = path.join(OUT, 'zip-download-fixed.zip');
  await zipDownload.saveAs(zipPath);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'desktop_6_zip_download_fixed.png'), fullPage: true });

  await context.close();
  await browser.close();

  fs.writeFileSync(path.join(OUT, 'zipfix-results.json'), JSON.stringify({
    rowCount, btnText, zipBtnText, zipPath, suggestedFilename: zipDownload.suggestedFilename(), url: zipDownload.url(), consoleErrors,
  }, null, 2));
  console.log('ZIPFIX DONE', JSON.stringify({ rowCount, btnText, zipBtnText, consoleErrors }, null, 2));
})().catch((e) => { console.error('ZIPFIX FAILED', e && e.stack || e); process.exit(1); });
