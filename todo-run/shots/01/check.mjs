// Item 01 live check: the breakcore playlist shows 7 rows and explains the 4 YouTube hides.
// One playlist submit only; Search All is never clicked.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const URL_ = 'https://music.youtube.com/playlist?list=PLJU2iuLr5pzzwD1BjsQSX4Exb-w1Wc2Kp';
const NOTICE = /Showing 7 of 11 songs\. 4 are unavailable on YouTube\./;
const kill = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 90000);

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const result = {};
page.on('response', async (res) => {
  if (res.url().includes('/api/playlist')) {
    try { const d = await res.json(); result.api = { returnedCount: d.returnedCount, loadedCount: d.loadedCount, unavailableCount: d.unavailableCount, truncated: d.truncated, playlistLength: d.playlistLength }; } catch {}
  }
});
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.fill('#playlist-url-input', URL_);
await page.press('#playlist-url-input', 'Enter');
const notice = page.getByText(NOTICE).first();
await notice.waitFor({ timeout: 45000 });
result.noticeText = (await notice.innerText()).trim();
result.rows = await page.locator('[id^="checkbox-song-"]').count();
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, 'desktop.png') });
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(600);
result.phoneNoticeVisible = await page.getByText(NOTICE).first().isVisible();
result.phoneScrollOk = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
await notice.scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(OUT, 'phone.png') });
result.dashInNotice = /[-–—]/.test(result.noticeText);
// Append the same playlist: every row is a duplicate, so no osu! search runs.
await page.setViewportSize({ width: 1280, height: 800 });
await page.fill('#playlist-url-input', URL_);
await page.press('#playlist-url-input', 'Enter');
const toast = page.getByText(/4 are unavailable on YouTube(?!\.)/).first();
await toast.waitFor({ timeout: 45000 });
result.toastText = (await toast.innerText()).trim();
result.rowsAfterAppend = await page.locator('[id^="checkbox-song-"]').count();
await page.screenshot({ path: path.join(OUT, 'desktop-append.png') });
console.log(JSON.stringify(result, null, 2));
await browser.close();
clearTimeout(kill);
