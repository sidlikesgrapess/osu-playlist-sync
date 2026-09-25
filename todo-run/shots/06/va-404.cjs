const { chromium } = require('playwright');
(async () => {
  const k = setTimeout(() => process.exit(2), 60000);
  const b = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('response', (r) => { if (r.status() === 404) console.log('404', r.url()); });
  await p.goto('http://localhost:3000', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  await b.close(); clearTimeout(k);
})();
