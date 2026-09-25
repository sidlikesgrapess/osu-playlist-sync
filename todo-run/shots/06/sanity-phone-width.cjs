const { chromium } = require('playwright');
(async () => {
  const t = setTimeout(() => process.exit(2), 60000);
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const p = await (await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })).newPage();
  await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#search-mode-songs-btn'); await p.waitForTimeout(900);
  await p.fill('#playlist-url-input', 'YOASOBI - Idol');
  console.log(JSON.stringify(await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, inputW: document.querySelector('#playlist-url-input').getBoundingClientRect().width }))));
  await p.screenshot({ path: 'todo-run/shots/06/sanity-phone-typed.png', clip: { x: 0, y: 380, width: 375, height: 130 } });
  await b.close(); clearTimeout(t);
})();
