// Verifier (acceptance lens) for item 05. Run: NODE_PATH="$(npm root -g)" node todo-run/shots/05/acceptance.cjs
const { chromium } = require('playwright');
const path = require('path');
const OUT = __dirname, BASE = 'http://localhost:3000', KEY = 'osu_bounce_enabled';
const R = []; const check = (n, ok, d = '') => { R.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); };
const hard = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 170000);
const ARGS = ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];
async function load(p) { await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#playlist-url-input', { timeout: 25000 }); await p.waitForTimeout(1200); }
const cs = (p, sel, prop) => p.evaluate(([s, pr]) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[pr] : null; }, [sel, prop]);
const SFX = 'button[title^="Sound Effects"]', BB = 'button[title^="Hover bounce"]';
const recorder = () => {
  window.__flips = [];
  document.addEventListener('DOMContentLoaded', () => {
    window.__dcl = document.documentElement.className;
    new MutationObserver(() => window.__flips.push(document.documentElement.className)).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  });
};
(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const errs = []; const watch = (p) => { p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(recorder);
    const p = await ctx.newPage(); watch(p);
    await load(p);
    const st0 = await p.evaluate((k) => ({ c: document.documentElement.className, v: localStorage.getItem(k) }), KEY);
    check('AC1/3 missing key: no osu-bounce class', !st0.c.includes('osu-bounce') && st0.v === null, JSON.stringify(st0));
    const t0 = await cs(p, SFX, 'transitionTimingFunction');
    check('AC1 default timing ease', /^ease(, ease)*$/.test(t0), t0);
    await p.evaluate((k) => localStorage.setItem(k, 'false'), KEY); await load(p);
    check('AC1 key false: no class', !(await p.evaluate(() => document.documentElement.classList.contains('osu-bounce'))));
    await p.evaluate((k) => localStorage.removeItem(k), KEY); await load(p);
    const nav = await p.evaluate(() => {
      const btns = [...document.querySelectorAll('header button, header a')];
      const i = btns.findIndex((b) => (b.title || '').startsWith('Sound Effects'));
      const b = btns[i + 1];
      return { next: b && b.title, cls: b && b.className, color: b && getComputedStyle(b).color, text: b && b.textContent, aria: b && b.getAttribute('aria-pressed') };
    });
    check('AC2 bounce button directly after SFX, osu-btn-interactive, grey when off', nav.next === 'Hover bounce off' && nav.cls.includes('osu-btn-interactive') && nav.color === 'rgb(136, 124, 147)', JSON.stringify(nav));
    await p.click(BB); await p.waitForTimeout(250);
    const st1 = await p.evaluate((k) => ({ c: document.documentElement.classList.contains('osu-bounce'), v: localStorage.getItem(k), col: getComputedStyle(document.querySelector('button[title^="Hover bounce"]')).color, t: document.querySelector('button[title^="Hover bounce"]').title }), KEY);
    check('AC2 click on: class + "true" + pink', st1.c && st1.v === 'true' && st1.col === 'rgb(255, 102, 170)' && st1.t === 'Hover bounce on', JSON.stringify(st1));
    const t1 = await cs(p, SFX, 'transitionTimingFunction'); const d1 = await cs(p, SFX, 'transitionDuration');
    check('AC6 on: overshoot curve', t1.includes('cubic-bezier(0.34, 1.56, 0.64, 1)'), `${t1} / ${d1}`);
    await p.hover(SFX); await p.waitForTimeout(90);
    await p.screenshot({ path: path.join(OUT, 'acc-desktop-navbar-hover-mid.png'), clip: { x: 640, y: 0, width: 640, height: 70 } });
    await p.waitForTimeout(500);
    const tr = await cs(p, SFX, 'transform');
    check('AC8 hover lift still translateY(-1px)', tr === 'matrix(1, 0, 0, 1, 0, -1)', tr);
    const box = await p.locator(SFX).boundingBox();
    await p.mouse.move(box.x + 5, box.y + 5); await p.mouse.down(); await p.waitForTimeout(30);
    const ta = await cs(p, SFX, 'transitionTimingFunction'); const da = await cs(p, SFX, 'transitionDuration');
    await p.mouse.up();
    check('AC6 :active stays snappy (ease, short)', /^ease/.test(ta) && !ta.includes('cubic') && parseFloat(da) <= 0.15, `${ta} / ${da}`);
    const pill = await p.evaluate(() => { const e = document.createElement('div'); e.className = 'osu-pill-tab'; document.body.appendChild(e); const s = getComputedStyle(e).transitionTimingFunction; e.remove(); return s; });
    check('AC6 pill tab gets curve', pill.includes('cubic-bezier(0.34'), pill);
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('#playlist-url-input'); await p.waitForTimeout(2000);
    const fl = await p.evaluate(() => ({ dcl: window.__dcl, flips: window.__flips, now: document.documentElement.className }));
    check('AC4 class at DCL, no flips after', (fl.dcl || '').includes('osu-bounce') && fl.flips.every((c) => c.includes('osu-bounce')) && fl.now.includes('osu-bounce'), JSON.stringify(fl));
    const headHtml = await p.evaluate(() => [...document.head.querySelectorAll('script:not([src])')].map((s) => s.textContent).find((t) => t.includes('osu_bounce_enabled')) || '');
    check('AC4 inline try/catch script in head', headHtml.startsWith('try{') && headHtml.includes('catch'), headHtml);
    // Second pass: no live search again. Inject a synthetic row with the same classes to measure the hover end state.
    await p.evaluate(() => { const r = document.createElement('div'); r.className = 'osu-table-row'; r.id = 'fakerow'; r.style.cssText = 'position:fixed;top:600px;left:20px;width:400px;height:52px;z-index:2147483647;display:flex;gap:10px'; r.innerHTML = '<div class="osu-thumb-container" style="width:40px;height:40px"><img style="width:40px;height:40px;display:block" src="/favicon.svg"></div><button class="osu-play-btn" style="width:30px;height:30px">p</button>'; document.body.appendChild(r); });
    const before = await p.locator('#fakerow').boundingBox();
    await p.hover('#fakerow .osu-thumb-container'); await p.waitForTimeout(700);
    const after = await p.locator('#fakerow').boundingBox();
    const sc = await p.evaluate(() => ({ th: getComputedStyle(document.querySelector('#fakerow .osu-thumb-container')).transform, img: getComputedStyle(document.querySelector('#fakerow img')).transform, tt: getComputedStyle(document.querySelector('#fakerow .osu-thumb-container')).transitionTimingFunction }));
    await p.hover('#fakerow .osu-play-btn'); await p.waitForTimeout(700);
    sc.play = await p.evaluate(() => getComputedStyle(document.querySelector('#fakerow .osu-play-btn')).transform);
    check('AC8 thumb 1.04 / img 1.06 / play 1.1 unchanged, row box unchanged', sc.th === 'matrix(1.04, 0, 0, 1.04, 0, 0)' && sc.img === 'matrix(1.06, 0, 0, 1.06, 0, 0)' && sc.play === 'matrix(1.1, 0, 0, 1.1, 0, 0)' && JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ sc, before, after }));
    await p.evaluate(() => document.getElementById('fakerow').remove());
    await p.mouse.move(5, 400);
    await p.click(BB); await p.waitForTimeout(250);
    const st2 = await p.evaluate((k) => ({ c: document.documentElement.classList.contains('osu-bounce'), v: localStorage.getItem(k) }), KEY);
    await load(p);
    const st3 = await p.evaluate(() => document.documentElement.classList.contains('osu-bounce'));
    check('AC2 click off: removed, "false", absent after reload', !st2.c && st2.v === 'false' && !st3, JSON.stringify(st2) + ' ' + st3);
    await ctx.close();
    const rc = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    await rc.addInitScript((k) => { try { localStorage.setItem(k, 'true'); } catch {} }, KEY);
    const rp = await rc.newPage(); watch(rp); await load(rp);
    const rt = await cs(rp, SFX, 'transitionTimingFunction');
    check('AC7 reduced motion + key true: ease', !rt.includes('cubic'), rt);
    await rc.close();
    const bc = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await bc.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); });
    const bp = await bc.newPage(); const berr = []; bp.on('pageerror', (e) => berr.push(e.message)); await load(bp);
    await bp.click(BB); await bp.waitForTimeout(200);
    const bst = await bp.evaluate(() => document.documentElement.classList.contains('osu-bounce'));
    check('AC4 blocked storage: page renders, toggle still works, no page error', bst && berr.length === 0, JSON.stringify(berr));
    await bc.close();
    for (const on of [false, true]) {
      const pc = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      if (on) await pc.addInitScript((k) => { try { localStorage.setItem(k, 'true'); } catch {} }, KEY);
      const pp = await pc.newPage(); watch(pp); await load(pp);
      const m = await pp.evaluate(() => {
        const a = [...document.querySelectorAll('header a, header button')].find((x) => /Report/i.test(x.textContent + x.title));
        const all = [...document.querySelector('header').querySelectorAll('button, a')].filter((e) => e.offsetParent);
        return { sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, rep: a && a.getBoundingClientRect().toJSON(), rows: [...new Set(all.map((e) => Math.round(e.getBoundingClientRect().top)))], maxRight: Math.max(...all.map((e) => e.getBoundingClientRect().right)), bounce: !!document.querySelector('button[title^="Hover bounce"]') };
      });
      check(`AC10 phone ${on ? 'on' : 'off'}: fits one row`, m.sw <= 375 && m.bw <= 375 && m.rep && m.rep.right <= 375 && m.rep.left >= 0 && m.rows.length === 1 && m.maxRight <= 375 && m.bounce, JSON.stringify(m));
      await pp.screenshot({ path: path.join(OUT, `acc-phone-navbar-${on ? 'on' : 'off'}.png`), clip: { x: 0, y: 0, width: 375, height: 80 } });
      await pc.close();
    }
    const hyd = errs.filter((e) => /hydrat|did not match|mismatch|server rendered/i.test(e));
    check('AC5 no hydration warnings', hyd.length === 0, hyd.join(' | ').slice(0, 400));
    console.log('console errors/warnings:', JSON.stringify(errs.slice(0, 8)).slice(0, 1500));
  } catch (e) { console.error('ERR', e); R.push(false); }
  finally { await browser.close(); clearTimeout(hard); const f = R.filter((x) => !x).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0); }
})();
