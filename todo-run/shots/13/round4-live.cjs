// Round 4 implement check: one live flow (fuller match wins) (real /api/playlist and /api/osu/search), desktop then resized to phone.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';
(async () => {
  const hard = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 150000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const R = { errors: [], searches: [], responses: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') R.errors.push(m.text()); });
  page.on('pageerror', (e) => R.errors.push('pageerror ' + e.message));
  page.on('request', (r) => { if (r.url().includes('/api/osu/search')) R.searches.push(Object.fromEntries(new URL(r.url()).searchParams)); });
  page.on('response', async (r) => { if (r.url().includes('/api/osu/search')) { try { const j = await r.json(); R.responses.push({ status: r.status(), bestScore: j.bestScore, rejection: j.rejection, top: (j.beatmapsets||[]).slice(0,3).map(b => `${b.artist} - ${b.title} (${b.matchScore})`) }); } catch (e) { R.responses.push({ status: r.status() }); } } });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#playlist-url-input', { timeout: 60000 });
    await page.waitForTimeout(900);
    await page.fill('#playlist-url-input', 'Disturbed - The Sound Of Silence (CYRIL Remix)');
    await page.press('#playlist-url-input', 'Enter');
    await page.waitForFunction(() => false, null, { timeout: 1 }).catch(() => {});
    for (let i = 0; i < 40 && R.responses.length === 0; i++) await page.waitForTimeout(500);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, 'round4_desktop_live.png') });
    R.desktopText = (await page.evaluate(() => document.body.innerText)).slice(0, 3000);
    R.desktopSW = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, 'round4_phone_live.png') });
    R.phoneText = (await page.evaluate(() => document.body.innerText)).slice(0, 3000);
    R.phoneSW = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  } catch (e) { R.errors.push('fatal ' + e.message); }
  await browser.close(); clearTimeout(hard);
  fs.writeFileSync(path.join(OUT, 'round4-live-results.json'), JSON.stringify(R, null, 2));
  console.log(JSON.stringify({ errors: R.errors, searches: R.searches, responses: R.responses, dSW: R.desktopSW, pSW: R.phoneSW }, null, 1));
})();
