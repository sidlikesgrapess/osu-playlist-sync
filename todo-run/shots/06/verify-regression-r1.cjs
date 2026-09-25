const { chromium } = require('playwright');
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(2); }, 110000);
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'] });
  const out = {};
  for (const [name, vp] of [['desktop',{width:1280,height:800}],['phone',{width:375,height:812}]]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: name==='phone', hasTouch: name==='phone' });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    const hits = [];
    await page.route('**/api/osu/**', r => { hits.push(new URL(r.request().url()).pathname); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ isDemo: true, beatmapsets: [], items: [] }) }); });
    await page.route('**/api/playlist**', r => { hits.push('/api/playlist'); r.continue(); });
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#search-mode-songs-btn', { timeout: 30000 });
    const R = {};
    R.dropdown = await page.locator('#platform-dropdown-btn').count();
    R.songsChecked = await page.getAttribute('#search-mode-songs-btn', 'aria-checked');
    R.phPlaceholder = await page.getAttribute('#playlist-url-input', 'placeholder');
    await page.fill('#playlist-url-input', 'https://music.apple.com/us/album/x/1440935467');
    R.detectedApple = await page.getAttribute('#search-mode-songs-btn', 'data-detected');
    R.inputW = (await page.locator('#playlist-url-input').boundingBox()).width;
    R.overflow = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    await page.click('#search-mode-player-btn');
    R.playerChecked = await page.getAttribute('#search-mode-player-btn', 'aria-checked');
    R.playerPlaceholder = await page.getAttribute('#playlist-url-input', 'placeholder');
    await page.fill('#playlist-url-input', 'mrekk');
    await page.press('#playlist-url-input', 'Enter');
    await page.waitForTimeout(1500);
    R.hitsAfterPlayer = [...hits];
    await page.screenshot({ path: `todo-run/shots/06/r1-regression-${name}.png` });
    R.errs = errs;
    out[name] = R;
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
