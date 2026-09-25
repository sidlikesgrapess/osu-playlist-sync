// Sanity check for item 05 (hover bounce).
// Run: NODE_PATH="$(npm root -g)" node todo-run/shots/05/verify.cjs
const { chromium } = require('playwright');
const path = require('path');
const OUT = __dirname;
const BASE = 'http://localhost:3000';
const KEY = 'osu_bounce_enabled';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`);
};
const hardStop = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 150000);

async function load(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 20000 });
  await page.waitForTimeout(900);
}
const sfxTiming = (page) => page.evaluate(() => {
  const b = document.querySelector('button[title^="Sound Effects"]');
  return getComputedStyle(b).transitionTimingFunction;
});
const bounceBtn = (page) => page.locator('button[title^="Hover bounce"]');
const state = (page) => page.evaluate((k) => ({
  c: document.documentElement.classList.contains('osu-bounce'),
  v: localStorage.getItem(k),
}), KEY);

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const consoleErrors = [];
  const watch = (page) => page.on('console', (m) => {
    if (m.type() === 'error' || /hydrat/i.test(m.text())) consoleErrors.push(m.text());
  });
  try {
    // Desktop, fresh profile: default off.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => { window.__classAtDCL = document.documentElement.className; });
    });
    const page = await ctx.newPage(); watch(page);
    await load(page);
    check('default: no class', !(await state(page)).c);
    const t0 = await sfxTiming(page);
    check('default: ease timing', t0.includes('ease') && !t0.includes('cubic-bezier'), t0);
    check('default: title off', (await bounceBtn(page).getAttribute('title')) === 'Hover bounce off');

    await bounceBtn(page).click();
    await page.waitForTimeout(200);
    const s1 = await state(page);
    check('toggle on: class + storage', s1.c && s1.v === 'true', JSON.stringify(s1));
    const t1 = await sfxTiming(page);
    check('toggle on: overshoot timing', t1.includes('cubic-bezier(0.34, 1.56, 0.64, 1)'), t1);
    check('toggle on: title on', (await bounceBtn(page).getAttribute('title')) === 'Hover bounce on');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#playlist-url-input');
    await page.waitForTimeout(900);
    const dcl = await page.evaluate(() => window.__classAtDCL);
    check('reload: class present at DOMContentLoaded (no flash)', (dcl || '').includes('osu-bounce'), JSON.stringify(dcl));
    check('reload: class still present after hydrate', (await state(page)).c);
    check('reload: button shows on', (await bounceBtn(page).getAttribute('title')) === 'Hover bounce on');

    // Hover a navbar button mid transition.
    await page.locator('button[title^="Sound Effects"]').hover();
    await page.waitForTimeout(90);
    await page.screenshot({ path: path.join(OUT, 'desktop-bounce-navbar-hover.png'), clip: { x: 0, y: 0, width: 1280, height: 70 } });

    // One single song search, for a row hover.
    await page.click('#platform-dropdown-btn');
    await page.waitForTimeout(300);
    await page.click('text=Single Song Search');
    await page.fill('#playlist-url-input', 'YOASOBI - Idol');
    await page.press('#playlist-url-input', 'Enter');
    await page.waitForSelector('.osu-table-desktop .osu-table-row', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const row = page.locator('.osu-table-desktop .osu-table-row').first();
    if (await row.count()) {
      const thumbT = await page.evaluate(() => getComputedStyle(document.querySelector('.osu-table-desktop .osu-table-row .osu-thumb-container')).transitionTimingFunction);
      check('row thumb: overshoot timing', thumbT.includes('cubic-bezier'), thumbT);
      await row.locator('.osu-thumb-container').first().hover();
      await page.waitForTimeout(120);
      await page.screenshot({ path: path.join(OUT, 'desktop-bounce-hover.png') });
    } else check('row rendered for hover', false);

    // Toggle off: removed, storage false, stays off after reload.
    await bounceBtn(page).click();
    await page.waitForTimeout(200);
    const s2 = await state(page);
    check('toggle off: class removed + storage false', !s2.c && s2.v === 'false', JSON.stringify(s2));
    await load(page);
    check('toggle off: absent after reload', !(await state(page)).c);
    await ctx.close();

    // Reduced motion with key true: class may be present, timing must stay ease.
    const rctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    await rctx.addInitScript((k) => { try { localStorage.setItem(k, 'true'); } catch {} }, KEY);
    const rp = await rctx.newPage(); watch(rp);
    await load(rp);
    const tr = await sfxTiming(rp);
    check('reduced motion: timing stays ease', tr.includes('ease') && !tr.includes('cubic-bezier'), tr);
    await rctx.close();

    // Phone 375x812, off and on.
    for (const on of [false, true]) {
      const pctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
      if (on) await pctx.addInitScript((k) => { try { localStorage.setItem(k, 'true'); } catch {} }, KEY);
      const pp = await pctx.newPage(); watch(pp);
      await load(pp);
      const m = await pp.evaluate(() => {
        const a = [...document.querySelectorAll('header a')].find((x) => /Report Issue/.test(x.textContent));
        const r = a.getBoundingClientRect();
        const header = document.querySelector('header > div');
        const tops = [...header.querySelectorAll('button, a')].map((e) => Math.round(e.getBoundingClientRect().top));
        return { sw: document.documentElement.scrollWidth, right: Math.round(r.right), tops: [...new Set(tops)] };
      });
      check(`phone (${on ? 'on' : 'off'}): no overflow, Report Issue in view, one row`,
        m.sw <= 375 && m.right <= 375 && m.tops.length === 1, JSON.stringify(m));
      await pp.screenshot({ path: path.join(OUT, `phone-navbar-${on ? 'on' : 'off'}.png`), clip: { x: 0, y: 0, width: 375, height: 70 } });
      if (on) {
        // Touch: (hover: hover) is false, so no bounce timing even with the key on.
        const tt = await sfxTiming(pp);
        check('phone touch: no bounce timing', !tt.includes('cubic-bezier'), tt);
      }
      await pctx.close();
    }

    const hyd = consoleErrors.filter((e) => /hydrat|did not match|mismatch/i.test(e));
    check('no hydration warnings', hyd.length === 0, hyd.join(' | ').slice(0, 300));
    if (consoleErrors.length) console.log('console errors (all):', consoleErrors.slice(0, 5));
  } finally {
    await browser.close();
    clearTimeout(hardStop);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  }
})();
