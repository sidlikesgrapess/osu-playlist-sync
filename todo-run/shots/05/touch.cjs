const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'] });
const c = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
await c.addInitScript(() => localStorage.setItem('osu_bounce_enabled','true'));
const p = await c.newPage(); await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#playlist-url-input'); await p.waitForTimeout(1000);
console.log(await p.evaluate(() => ({ hover: matchMedia('(hover: hover)').matches, cls: document.documentElement.className, t: getComputedStyle(document.querySelector('button[title^="Sound Effects"]')).transitionTimingFunction })));
await b.close(); })();
