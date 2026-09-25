import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const OUT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const kill = setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(2); }, 150000);
const QUERIES = [['rere', 'Re:Re:'], ['akg_rere', 'ASIAN KUNG-FU GENERATION - Re:Re:']];
const VPS = { desktop: { width: 1280, height: 800 }, phone: { width: 375, height: 812 } };
const results = [];
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: VPS.desktop });
  const searches = [];
  page.on('response', async (res) => {
    if (!res.url().includes('/api/osu/search')) return;
    try { const j = await res.json(); const top = j.beatmapsets?.[0];
      searches.push({ url: decodeURIComponent(res.url()), status: res.status(), top: top && `${top.artist} | ${top.title}`, artistOverride: !!top?.artistOverride, titleOnly: !!top?.titleOnly, rejection: j.rejection?.kind || null, n: j.beatmapsets?.length });
    } catch (e) { searches.push({ status: res.status(), err: e.message }); }
  });
  for (const [name, q] of QUERIES) {
    await page.setViewportSize(VPS.desktop);
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#playlist-url-input', { timeout: 30000 });
    await page.waitForTimeout(900);
    await page.click('#search-mode-songs-btn');
    await page.fill('#playlist-url-input', q);
    const before = searches.length;
    await page.press('#playlist-url-input', 'Enter');
    const t0 = Date.now();
    while (searches.length === before && Date.now() - t0 < 40000) await page.waitForTimeout(300);
    await page.waitForTimeout(2000);
    for (const vp of ['desktop', 'phone']) {
      await page.setViewportSize(VPS[vp]);
      await page.waitForTimeout(1000);
      const body = await page.innerText('body');
      const shot = `verify_${vp}_${name}.png`;
      await page.screenshot({ path: path.join(OUT, shot), fullPage: true });
      const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      results.push({ vp, q, api: searches.slice(before), showsAKG: /ASIAN KUNG-FU GENERATION/.test(body), showsReReTitle: /Re:Re/.test(body), couldNotFind: /Could not find one by/i.test(body), noHScroll, shot,
        bodyExcerpt: body.slice(Math.max(0, body.indexOf('Re:Re') - 300), body.indexOf('Re:Re') + 500) });
    }
    await page.waitForTimeout(3000);
  }
} finally { await browser.close(); clearTimeout(kill); }
fs.writeFileSync(path.join(OUT, 'verify-live-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
