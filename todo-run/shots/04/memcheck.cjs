// Item 04: after a preview plays and a new search replaces the list, the old rows are gone,
// the shared <audio> holds no src, and the JS heap does not climb across A/B cycles.
// Every osu!/provider call is stubbed; preview audio is a local silent WAV, covers a 1px PNG.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const BASE = 'http://localhost:3000';
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(OUT, '..', '03', 'search-cache.json'), 'utf8')).beatmapsets[0];
const N = 40;
const CYCLES = Number(process.env.CYCLES || 5);
const SNAP = process.env.SNAP === '1';

function silentWav(seconds) {
  const rate = 8000; const n = rate * seconds; const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36);
  b.writeUInt32LE(n, 40); b.fill(128, 44); return b;
}
const WAV = silentWav(30);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const playlist = (tag) => ({
  success: true, platform: 'spotify', playlistId: tag, playlistTitle: `Stub ${tag}`, isSingleTrack: false,
  returnedCount: N, loadedCount: N, unavailableCount: 0, truncated: false, playlistLength: N,
  songs: Array.from({ length: N }, (_, i) => ({
    id: `${tag}_${i}`, index: i, title: `${tag} Song ${i}`, channelTitle: `${tag} Artist ${i}`,
    thumbnail: '', duration: '3:00', source: 'spotify', cleanQuery: `${tag} Artist ${i} ${tag} Song ${i}`,
    extractedTitle: `${tag} Song ${i}`, extractedArtist: `${tag} Artist ${i}`, fallbacks: [], queries: [],
  })),
});

let setId = 5000000;
function searchBody(url) {
  const q = new URL(url).searchParams.get('q') || new URL(url).searchParams.get('query') || 'x';
  const id = setId++;
  const set = { ...TEMPLATE, id, title: q, titleUnicode: q, previewUrl: `https://b.ppy.sh/preview/${id}.mp3`,
    covers: Object.fromEntries(Object.keys(TEMPLATE.covers).map((k) => [k, `https://assets.ppy.sh/beatmaps/${id}/covers/${k}.jpg`])) };
  return JSON.stringify({ success: true, query: q, total: 1, bestScore: 200, beatmapsets: [set], isDemo: false, rejection: null, artistConfidence: 'high' });
}

async function run(browser, name, viewport) {
  const R = { name, viewport, cycles: [] };
  const log = [];
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const Orig = window.Audio;
    window.__audios = [];
    window.Audio = function (...a) { const el = new Orig(...a); window.__audios.push(el); return el; };
    window.Audio.prototype = Orig.prototype;
  });
  page.on('console', (m) => { if (m.type() === 'error') log.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  const leaked = [];
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    if (u.includes('/api/playlist')) {
      const tag = decodeURIComponent(u).match(/playlist\/(\w+)/)?.[1] || 'X';
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(playlist(tag)) });
    }
    if (u.includes('/api/osu/player')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'results', users: [], total: 0, page: 1 }) });
    if (u.includes('/api/osu/')) return r.fulfill({ status: 200, contentType: 'application/json', body: searchBody(u) });
    if (u.includes('b.ppy.sh/preview/')) return r.fulfill({ status: 200, contentType: 'audio/wav', body: WAV });
    if (u.includes('ppy.sh')) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.includes('fonts.g')) leaked.push(u);
    return r.continue();
  });
  const cdp = await ctx.newCDPSession(page);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  };
  async function snapshot(file) {
    let chunks = [];
    const onChunk = (e) => chunks.push(e.chunk);
    cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
    const raw = chunks.join(''); chunks = null;
    if (process.env.RAW) fs.writeFileSync(process.env.RAW, raw);
    const snap = JSON.parse(raw);
    const m = snap.snapshot.meta; const F = m.node_fields.length;
    const iType = m.node_fields.indexOf('type'), iName = m.node_fields.indexOf('name'), iSize = m.node_fields.indexOf('self_size');
    const types = m.node_types[0]; const agg = {};
    for (let i = 0; i < snap.nodes.length; i += F) {
      const t = types[snap.nodes[i + iType]];
      const n = t === 'object' || t === 'closure' || t === 'native' ? `${t}:${snap.strings[snap.nodes[i + iName]]}` : t;
      const a = agg[n] || (agg[n] = [0, 0]); a[0] += 1; a[1] += snap.nodes[i + iSize];
    }
    fs.writeFileSync(path.join(OUT, file), JSON.stringify(agg));
  }
  const audioState = () => page.evaluate(() => window.__audios.map((a) => ({
    src: a.getAttribute('src'), currentSrc: a.currentSrc, networkState: a.networkState, paused: a.paused,
    handlers: ['onended', 'onwaiting', 'onstalled', 'onplaying', 'onerror'].filter((h) => a[h]).length,
  })));
  const rowCount = (tag) => page.evaluate((t) => [...document.querySelectorAll('body *')]
    .filter((e) => e.childElementCount === 0 && e.textContent.startsWith(`${t} Song `)).length, tag);

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 20000 });
  await page.waitForTimeout(800);

  async function load(tag) {
    await page.fill('#playlist-url-input', `https://open.spotify.com/playlist/${tag}`);
    await page.press('#playlist-url-input', 'Enter');
    await page.waitForFunction((t) => document.body.innerText.includes(`${t} Song 0`), tag, { timeout: 20000 }).catch(async (e) => { await page.screenshot({ path: path.join(OUT, 'debug.png') }); fs.writeFileSync(path.join(OUT, 'debug.txt'), await page.evaluate(() => document.body.innerText)); throw e; });
    // wait for the search fan out to finish (all visible rows matched)
    await page.waitForFunction(() => [...document.querySelectorAll('.osu-play-btn')].some((e) => e.offsetParent !== null), null, { timeout: 30000 });
    await page.waitForTimeout(2500);
  }

  // Clicks go through page.evaluate, not page.click: Playwright's element handles are held by
  // the DevTools session ("Global handles / DevTools console" in a heap snapshot), which kept
  // every clicked row, and with it its whole detached table, alive and read as a leak.
  const clickFirst = (sel) => page.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.offsetParent !== null);
    if (!el) throw new Error(`no visible ${s}`);
    el.click();
  }, sel);
  const play = async () => {
    await clickFirst('.osu-play-btn');
    await page.waitForFunction(() => window.__audios[0] && !window.__audios[0].paused && window.__audios[0].currentTime > 0, null, { timeout: 10000 });
    return (await audioState())[0];
  };

  for (let c = 0; c < CYCLES; c++) {
    const cyc = {};
    const A = `A${c}`; const B = `B${c}`;

    // A, then a player search drops it while its preview plays
    await load(A);
    cyc.playingA = await play();
    if (c === 0) await page.screenshot({ path: path.join(OUT, `${name}_A_playing.png`) });
    await page.fill('#playlist-url-input', 'https://osu.ppy.sh/users/nobody');
    await page.press('#playlist-url-input', 'Enter');
    await page.waitForFunction(() => document.body.innerText.includes('No osu! players found'), null, { timeout: 15000 });
    await page.waitForTimeout(500);
    cyc.rowsAAfterPlayer = await rowCount(A);
    cyc.afterPlayerSearch = (await audioState())[0];
    cyc.heapAfterPlayer = await heap();
    if (c === 0) await page.screenshot({ path: path.join(OUT, `${name}_after_player_search.png`) });

    // B, replay works on the reused element, toggle off releases, play again, then clear list
    await load(B);
    cyc.replayB = await play();
    await clickFirst('.osu-play-btn');
    await page.waitForTimeout(300);
    cyc.toggleOff = (await audioState())[0];
    cyc.previewErrorsShown = await page.locator('text=Preview unavailable').evaluateAll((els) => els.filter((e) => e.offsetParent).length);
    await play();
    if (c === 0) await page.screenshot({ path: path.join(OUT, `${name}_B_playing.png`) });
    await clickFirst('button[title="Clear playlist results"]');
    await page.waitForTimeout(500);
    cyc.rowsBAfterClear = await rowCount(B);
    cyc.afterClear = (await audioState())[0];
    cyc.heapB = await heap();
    if (c === 0) await page.screenshot({ path: path.join(OUT, `${name}_after_clear.png`) });
    if (SNAP && name === 'desktop' && (c === 1 || c === CYCLES - 1)) await snapshot(`snap_${c}.json`);
    R.cycles.push(cyc);
  }
  R.audioCount = await page.evaluate(() => window.__audios.length);
  const hb = R.cycles.map((c) => c.heapB);
  R.heapBFirst = hb[0]; R.heapBLast = hb[hb.length - 1];
  R.heapGrowth = R.heapBLast - R.heapBFirst;
  R.heapOk = R.heapGrowth < Math.max(2 * 1024 * 1024, 0.1 * R.heapBFirst);
  R.consoleErrors = log;
  R.leakedRequests = leaked;
  await ctx.close();
  return R;
}

(async () => {
  const kill = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 420000);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'] });
  const results = [];
  results.push(await run(browser, 'desktop', { width: 1280, height: 800 }));
  results.push(await run(browser, 'phone', { width: 375, height: 812 }));
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'memcheck-results.json'), JSON.stringify(results, null, 2));
  for (const r of results) {
    console.log(r.name, 'heapB MB', r.cycles.map((c) => (c.heapB / 1048576).toFixed(2)).join(' '), 'growth', (r.heapGrowth / 1048576).toFixed(2), 'ok', r.heapOk);
    console.log(' afterPlayer [rowsA, src, netState, handlers, paused]', JSON.stringify(r.cycles.map((c) => [c.rowsAAfterPlayer, c.afterPlayerSearch.src, c.afterPlayerSearch.networkState, c.afterPlayerSearch.handlers, c.afterPlayerSearch.paused])));
    console.log(' afterClear [rowsB, src, netState, handlers]', JSON.stringify(r.cycles.map((c) => [c.rowsBAfterClear, c.afterClear.src, c.afterClear.networkState, c.afterClear.handlers])));
    console.log(' replay/toggleOff [replaySrcSet, offSrc, offNet, errorsShown]', JSON.stringify(r.cycles.map((c) => [!!c.replayB.src, c.toggleOff.src, c.toggleOff.networkState, c.previewErrorsShown])));
    console.log(' heapAfterPlayer MB', r.cycles.map((c) => (c.heapAfterPlayer / 1048576).toFixed(2)).join(' '));
    console.log(' audios', r.audioCount, 'errors', r.consoleErrors.length, 'leaked', r.leakedRequests.length);
  }
  clearTimeout(kill);
})().catch((e) => { console.error(e); process.exit(1); });
