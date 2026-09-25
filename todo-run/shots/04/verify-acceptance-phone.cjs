// Verifier (round 1, acceptance lens) for item 04. Independent of memcheck.cjs.
// Everything external is stubbed; no osu! call is made.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(OUT, '..', '03', 'search-cache.json'), 'utf8')).beatmapsets[0];
const N = 40;
function wav(seconds) {
  const rate = 8000; const n = Math.round(rate * seconds); const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36);
  b.writeUInt32LE(n, 40); b.fill(128, 44); return b;
}
const LONG = wav(30), SHORT = wav(1);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const playlist = (tag) => ({ success: true, platform: 'spotify', playlistId: tag, playlistTitle: `Stub ${tag}`, isSingleTrack: false,
  returnedCount: N, loadedCount: N, unavailableCount: 0, truncated: false, playlistLength: N,
  songs: Array.from({ length: N }, (_, i) => ({ id: `${tag}_${i}`, index: i, title: `${tag} Song ${i}`, channelTitle: `${tag} Artist ${i}`,
    thumbnail: '', duration: '3:00', source: 'spotify', cleanQuery: `${tag} Artist ${i} ${tag} Song ${i}`,
    extractedTitle: `${tag} Song ${i}`, extractedArtist: `${tag} Artist ${i}`, fallbacks: [], queries: [] })) });
let setId = 7000000;
const mkSet = (title) => { const id = setId++; return { ...TEMPLATE, id, title, titleUnicode: title, previewUrl: `https://b.ppy.sh/preview/${id}.mp3`,
  covers: Object.fromEntries(Object.keys(TEMPLATE.covers).map((k) => [k, `https://assets.ppy.sh/beatmaps/${id}/covers/${k}.jpg`])) }; };
const user = { id: 424242, username: 'verifier', avatarUrl: null, countryCode: 'JP', coverUrl: null, globalRank: 1, countryRank: 1, pp: 1000, playCount: 10, counts: { best: 5, most_played: 0, favourite: 0 } };

async function run(browser, name, viewport) {
  const R = { name }; const log = []; const leaked = [];
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const Orig = window.Audio; window.__audios = [];
    window.Audio = function (...a) { const el = new Orig(...a); window.__audios.push(el); return el; };
    window.Audio.prototype = Orig.prototype;
  });
  page.on('console', (m) => { if (m.type() === 'error') log.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  let previewMode = 'long';
  await ctx.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.includes('/api/playlist')) { const tag = decodeURIComponent(u).match(/playlist\/(\w+)/)?.[1] || 'X';
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(playlist(tag)) }); }
    if (u.includes('/api/osu/player/beatmaps')) { const items = Array.from({ length: 5 }, (_, i) => ({ beatmapset: mkSet(`Player Set ${i}`), meta: { pp: 500, rank: 'S', accuracy: 99, mods: [] } }));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'best', items, fetched: 5, total: 5 }) }); }
    if (u.includes('/api/osu/player')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'profile', user }) });
    if (u.includes('/api/osu/')) { const q = new URL(u).searchParams.get('q') || 'x';
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, query: q, total: 1, bestScore: 200, beatmapsets: [mkSet(q)], isDemo: false, rejection: null, artistConfidence: 'high' }) }); }
    if (u.includes('b.ppy.sh/preview/')) {
      if (previewMode === 'fail') return r.abort('failed');
      if (previewMode === 'slow') { await new Promise((res) => setTimeout(res, 3000)); return r.fulfill({ status: 200, contentType: 'audio/wav', body: LONG }).catch(() => {}); }
      return r.fulfill({ status: 200, contentType: 'audio/wav', body: previewMode === 'short' ? SHORT : LONG });
    }
    if (u.includes('ppy.sh')) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.includes('fonts.g')) leaked.push(u);
    return r.continue();
  });
  const cdp = await ctx.newCDPSession(page);
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize; };
  const audio = () => page.evaluate(() => window.__audios.map((a) => ({ src: a.getAttribute('src'), currentSrc: a.currentSrc, net: a.networkState, paused: a.paused,
    handlers: ['onended', 'onwaiting', 'onstalled', 'onplaying', 'onerror'].filter((h) => a[h]).length })));
  const unavailable = () => page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => e.childElementCount === 0 && /Preview unavailable/.test(e.textContent) && e.offsetParent).length);
  const rows = (tag) => page.evaluate((t) => [...document.querySelectorAll('body *')].filter((e) => e.childElementCount === 0 && e.textContent.startsWith(`${t} Song `)).length, tag);
  const click = (sel, idx = 0) => page.evaluate(([s, i]) => { const els = [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null); if (!els[i]) throw new Error('no ' + s); els[i].click(); }, [sel, idx]);
  const playing = () => page.waitForFunction(() => window.__audios[0] && !window.__audios[0].paused && window.__audios[0].currentTime > 0, null, { timeout: 12000 });
  async function load(tag) {
    // A second submit with a list present appends ("Add More Songs"); a new search clears first.
    if (await page.evaluate(() => !!document.querySelector('button[title="Clear playlist results"]'))) {
      await click('button[title="Clear playlist results"]'); await page.waitForTimeout(400);
    }
    await page.fill('#playlist-url-input', `https://open.spotify.com/playlist/${tag}`);
    await page.press('#playlist-url-input', 'Enter');
    await page.waitForFunction((t) => document.body.innerText.includes(`${t} Song 0`), tag, { timeout: 20000 }).catch(async (e) => { await page.screenshot({ path: path.join(OUT, 'va_debug.png') }); console.log('DEBUG', (await page.evaluate(() => document.body.innerText)).slice(0, 1500)); throw e; });
    await page.waitForFunction(() => [...document.querySelectorAll('.osu-play-btn')].some((e) => e.offsetParent !== null), null, { timeout: 30000 });
    await page.waitForTimeout(2000);
  }
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 20000 });
  await page.waitForTimeout(800);

  // S1: playlist A playing, replaced directly by playlist B (non-append fetch)
  await load('Aone'); await click('.osu-play-btn'); await playing();
  R.s1_playing = (await audio())[0];
  await page.screenshot({ path: path.join(OUT, `va_${name}_1_A_playing.png`) });
  await load('Btwo');
  R.s1_afterReplace = { rowsA: await rows('Aone'), audio: (await audio())[0] };
  await page.screenshot({ path: path.join(OUT, `va_${name}_2_B_replaced.png`) });

  // S2: stop during loading (toggle off), then list drop during loading
  previewMode = 'slow';
  await click('.osu-play-btn'); await page.waitForTimeout(400);
  R.s2_loadingSrcSet = !!(await audio())[0].src;
  await page.screenshot({ path: path.join(OUT, `va_${name}_3_loading.png`) });
  await click('.osu-play-btn'); await page.waitForTimeout(3800);
  R.s2_toggleOffDuringLoad = { audio: (await audio())[0], unavailable: await unavailable() };
  await click('.osu-play-btn', 1); await page.waitForTimeout(400);
  await load('Cthree'); await page.waitForTimeout(3000);
  R.s2_dropDuringLoad = { rowsB: await rows('Btwo'), audio: (await audio())[0], unavailable: await unavailable() };

  // S3: onended
  previewMode = 'short';
  await click('.osu-play-btn'); await page.waitForTimeout(3000);
  R.s3_afterEnded = { audio: (await audio())[0], unavailable: await unavailable() };

  // S4: fail
  previewMode = 'fail';
  await click('.osu-play-btn', 1); await page.waitForTimeout(2500);
  R.s4_afterFail = { audio: (await audio())[0], unavailable: await unavailable() };
  await page.screenshot({ path: path.join(OUT, `va_${name}_4_fail.png`) });

  // S5: replay after fail works
  previewMode = 'long';
  await click('.osu-play-btn', 2); await playing();
  R.s5_replay = (await audio())[0];

  // S6: player profile path while playing, then clear player
  await page.fill('#playlist-url-input', 'https://osu.ppy.sh/users/424242');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForFunction(() => document.body.innerText.includes('Player Set 0'), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  R.s6_afterPlayerProfile = { rowsC: await rows('Cthree'), audio: (await audio())[0] };
  await click('button[aria-label="Play audio preview"]'); await playing();
  R.s6_playerPlaying = (await audio())[0];
  await page.screenshot({ path: path.join(OUT, `va_${name}_5_player_playing.png`) });
  await click('button[title="Clear this player"]'); await page.waitForTimeout(800);
  R.s6_afterClearPlayer = { playerRows: await page.evaluate(() => document.body.innerText.includes('Player Set 0')), audio: (await audio())[0] };
  await page.screenshot({ path: path.join(OUT, `va_${name}_6_player_cleared.png`) });

  // Heap: 6 cycles of A(play) -> B(play); measure after each B
  const hs = [];
  for (let c = 0; c < 6; c++) {
    await load(`H${c}a`); await click('.osu-play-btn'); await playing();
    await load(`H${c}b`); await click('.osu-play-btn'); await playing();
    hs.push(await heap());
  }
  R.heapMB = hs.map((h) => +(h / 1048576).toFixed(2));
  R.heapGrowthMB = +((hs[hs.length - 1] - hs[0]) / 1048576).toFixed(2);
  R.audioCount = await page.evaluate(() => window.__audios.length);
  R.console = log; R.leaked = leaked;
  await ctx.close(); return R;
}
(async () => {
  const kill = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 400000);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'] });
  const res = [await run(browser, "phone", { width: 375, height: 812 })];
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'verify-acceptance-phone-only.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 1)); clearTimeout(kill);
})().catch((e) => { console.error(e); process.exit(1); });
