// Verifier (acceptance lens) for item 09. All external calls stubbed.
// Run: NODE_PATH="$(npm root -g)" node todo-run/shots/09/acc.cjs
const { chromium } = require('playwright');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(OUT, '..', '03', 'search-cache.json'), 'utf8')).beatmapsets[0];
const N = 25;
const SHARED = 9000000;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
function wav(seconds) {
  const rate = 8000; const n = Math.round(rate * seconds); const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36);
  b.writeUInt32LE(n, 40); b.fill(128, 44); return b;
}
const LONG = wav(30);
const mkSet = (id, title, status = 'ranked') => ({ ...TEMPLATE, id, title, titleUnicode: title, status, artistOverride: false, titleOnly: false,
  previewUrl: `https://b.ppy.sh/preview/${id}.mp3`,
  covers: Object.fromEntries(Object.keys(TEMPLATE.covers).map((k) => [k, `https://assets.ppy.sh/beatmaps/${id}/covers/${k}.jpg`])) });
const playlist = (tag, n = N) => ({ success: true, platform: 'spotify', playlistId: tag, playlistTitle: `Stub ${tag}`, isSingleTrack: false,
  returnedCount: n, loadedCount: n, unavailableCount: 0, truncated: false, playlistLength: n,
  songs: Array.from({ length: n }, (_, i) => ({ id: `${tag}_${i}`, index: i, title: `${tag} Song ${i}`, channelTitle: `${tag} Artist ${i}`,
    thumbnail: '', duration: '3:00', source: 'spotify', cleanQuery: `${tag} Artist ${i} ${tag} Song ${i}`,
    extractedTitle: `${tag} Song ${i}`, extractedArtist: `${tag} Artist ${i}`, fallbacks: [], queries: [] })) });
const users = {
  424242: { id: 424242, username: 'alpha', avatarUrl: null, countryCode: 'JP', coverUrl: null, globalRank: 1, countryRank: 1, pp: 1000, playCount: 10, counts: { best: 5, most_played: 0, favourite: 0 } },
  515151: { id: 515151, username: 'bravo', avatarUrl: null, countryCode: 'US', coverUrl: null, globalRank: 2, countryRank: 2, pp: 900, playCount: 10, counts: { best: 5, most_played: 0, favourite: 0 } },
};

async function run(browser, name, viewport, zipBuf, holder = {}) {
  const R = { name, checks: {} }; holder.R = R; const log = []; const leaked = []; const mirrorIds = []; const searchQs = [];
  let searchDelay = 0;
  const ok = (k, v, detail) => { R.checks[k] = { pass: !!v, ...(detail === undefined ? {} : { detail }) }; };
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const Orig = window.Audio; window.__audios = [];
    window.Audio = function (...a) { const el = new Orig(...a); window.__audios.push(el); return el; };
    window.Audio.prototype = Orig.prototype;
  });
  page.on('console', (m) => { if (m.type() === 'error') log.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  await ctx.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.includes('/api/playlist')) { const tag = decodeURIComponent(u).match(/playlist\/(\w+)/)?.[1] || 'X';
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(playlist(tag, tag === 'Cthree' ? 5 : N)) }); }
    if (u.includes('/api/osu/player/beatmaps')) {
      const uid = Number(decodeURIComponent(u).match(/(?:userId|user|id)=(\d+)/)?.[1] || 424242);
      const base = uid === 515151 ? 7000000 : SHARED;
      const items = Array.from({ length: 5 }, (_, i) => ({ beatmapset: mkSet(base + i, `${uid === 515151 ? 'Bravo' : 'Alpha'} Set ${i}`, i === 4 ? 'graveyard' : 'ranked'), meta: { pp: 500, rank: 'S', accuracy: 99, mods: [] } }));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'best', items, fetched: 5, total: 5 }) }); }
    if (u.includes('/api/osu/player')) {
      const q = decodeURIComponent(u);
      const uid = /515151/.test(q) ? 515151 : 424242;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'profile', user: users[uid] }) }); }
    if (u.includes('/api/osu/search')) {
      const q = new URL(u).searchParams.get('q') || 'x';
      searchQs.push({ q, t: Date.now() });
      if (searchDelay) await new Promise((res) => setTimeout(res, searchDelay));
      const m = q.match(/(\w+) Song (\d+)/); const tag = m ? m[1] : 'x'; const i = m ? Number(m[2]) : 0;
      const id = tag === 'Aone' && i < 2 ? SHARED + i : 8000000 + (tag.charCodeAt(0) * 100) + i;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, query: q, total: 1, bestScore: 200, beatmapsets: [mkSet(id, q)], isDemo: false, rejection: null, artistConfidence: 'high' }) }); }
    if (/catboy\.best\/d\/|nerinyan\.moe\/d\//.test(u)) {
      mirrorIds.push(Number(u.match(/\/d\/(\d+)/)[1]));
      return r.fulfill({ status: 200, contentType: 'application/x-osu-beatmap-archive', headers: { 'Access-Control-Allow-Origin': '*' }, body: zipBuf }); }
    if (u.includes('/api/download')) return r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"stub"}' });
    if (u.includes('b.ppy.sh/preview/')) return r.fulfill({ status: 200, contentType: 'audio/wav', body: LONG });
    if (u.includes('ppy.sh')) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.includes('fonts.g')) leaked.push(u);
    return r.continue();
  });

  const text = () => page.evaluate(() => document.body.innerText);
  const vis = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null).length, sel);
  const click = (sel, idx = 0) => page.evaluate(([s, i]) => { const els = [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null); if (!els[i]) throw new Error('no ' + s); els[i].click(); }, [sel, idx]);
  const clickText = (re, idx = 0) => page.evaluate(([src, i]) => { const r = new RegExp(src); const b = [...document.querySelectorAll('button')].filter((e) => e.offsetParent !== null && r.test(e.innerText.trim())); if (!b[i]) throw new Error('no button ' + src); b[i].click(); }, [re, idx]);
  const count = async () => { const m = (await text()).match(/Download(?: All)? \((\d+)\)/); return m ? Number(m[1]) : null; };
  const zipLabel = async () => { const m = (await text()).match(/ZIP[^\n]*?\((\d+)\)|\((\d+)\)[^\n]*ZIP/); return m ? Number(m[1] || m[2]) : null; };
  const selText = async () => (await text()).match(/(\d+) of (\d+) selected/)?.[0] || null;
  const rowsVisible = (prefix) => page.evaluate((t) => [...document.querySelectorAll('body *')].filter((e) => e.childElementCount === 0 && e.offsetParent !== null && e.textContent.startsWith(t)).map((e) => e.textContent), prefix);
  const checked = (id) => page.evaluate((i) => { const e = [...document.querySelectorAll(`#checkbox-song-${i}, #checkbox-mobile-song-${i}`)].find((x) => x.offsetParent !== null); if (!e) return 'missing'; return !!e.querySelector('svg'); }, id);
  const audio = () => page.evaluate(() => window.__audios.map((a) => ({ src: a.getAttribute('src'), paused: a.paused })));
  const shot = (n) => page.screenshot({ path: path.join(OUT, `acc_${name}_${n}.png`), fullPage: false });
  const submit = async (v) => { await page.fill('#playlist-url-input', v); await page.press('#playlist-url-input', 'Enter'); };

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 30000 });
  await page.waitForTimeout(800);

  // A1: playlist 25 rows; page 1 auto ticked (10). Go to page 2 (searches 10 more, auto ticks).
  await submit('https://open.spotify.com/playlist/Aone');
  await page.waitForFunction(() => /Download(?: All)? \(10\)/.test(document.body.innerText), null, { timeout: 30000 });
  await click('#pagination-page-2');
  await page.waitForFunction(() => /Download(?: All)? \(20\)/.test(document.body.innerText), null, { timeout: 30000 });
  await page.waitForTimeout(500);
  // Untick 2 rows on page 2 -> 18
  await click('#checkbox-song-Aone_12, #checkbox-mobile-song-Aone_12');
  await click('#checkbox-song-Aone_13, #checkbox-mobile-song-Aone_13');
  await page.waitForTimeout(300);
  const n1 = await count();
  const sel1 = await selText();
  const rows1 = (await rowsVisible('Aone Song')).sort();
  ok('A1_playlist_ticks_18', n1 === 18, { n1, sel1 });
  await shot('1_playlist_page2');
  // start a preview on the page
  await click('.osu-play-btn');
  await page.waitForFunction(() => window.__audios[0] && !window.__audios[0].paused && window.__audios[0].currentTime > 0, null, { timeout: 12000 }).catch(() => {});
  R.audioBefore = await audio();

  // Switch to player and load alpha
  await click('#search-mode-player-btn');
  await page.waitForTimeout(600);
  R.audioAfter = await audio();
  ok('A10_switch_stops_preview', R.audioBefore.some((a) => !a.paused) && R.audioAfter.length > 0 && R.audioAfter.every((a) => a.paused && !a.src), { before: R.audioBefore, after: R.audioAfter });
  ok('A4_bar_in_player_view_only_playlist_ticks', (await count()) === 18, await count());
  await shot('2_player_empty_bar');
  await submit('https://osu.ppy.sh/users/424242');
  await page.waitForFunction(() => document.body.innerText.includes('Alpha Set 0'), null, { timeout: 20000 });
  await page.waitForTimeout(600);
  ok('A5_player_search_keeps_playlist', (await count()) === 18, await count());
  await clickText('^Select All \\(5\\)$');
  await page.waitForTimeout(300);
  // 18 + 5 - 2 shared (Aone_0/1 match SHARED+0/1) = 21
  ok('A3_union_player_view', (await count()) === 21, await count());
  R.zipPlayerView = await zipLabel();
  await shot('3_player_union');

  // Back to playlist: same page (2), same rows, same ticks, same title, same count
  await click('#search-mode-songs-btn');
  await page.waitForTimeout(600);
  const rows2 = (await rowsVisible('Aone Song')).sort();
  ok('A1_same_page_rows', JSON.stringify(rows1) === JSON.stringify(rows2), { rows1: rows1.slice(0, 3), rows2: rows2.slice(0, 3) });
  ok('A1_same_ticks', (await checked('Aone_12')) === false && (await checked('Aone_14')) === true, { a12: await checked('Aone_12'), a14: await checked('Aone_14') });
  ok('A1_same_title', (await text()).includes('Stub Aone'));
  ok('A3_union_playlist_view', (await count()) === 21, await count());
  // SongTable counts only playlist
  ok('A7_songtable_counts_playlist_only', (await selText()) === sel1 && /^18 of /.test(sel1 || ''), { now: await selText(), before: sel1 });
  await shot('4_playlist_back');

  // A7: SongTable Deselect All only affects playlist
  await click('#select-confirmed-button');
  await page.waitForTimeout(300);
  R.afterConfirmed = { count: await count(), sel: await selText() };
  ok('A7_select_confirmed_playlist_only', R.afterConfirmed.count === 23 && /^20 of 20/.test(R.afterConfirmed.sel || ''), R.afterConfirmed);
  await click('#select-confirmed-button');
  await page.waitForTimeout(300);
  ok('A7_songtable_deselect_leaves_player', (await count()) === 5, await count());
  // header checkbox select all -> all matched playlist (20) + 5 player - 2 shared = 23
  if (name === 'desktop') {
  await click('#select-all-header-checkbox').catch(() => {});
  await page.waitForTimeout(300);
  R.afterHeaderSelect = { count: await count(), sel: await selText() };
  ok('A7_header_checkbox_playlist_only', R.afterHeaderSelect.count === 23 && /^20 of 20/.test(R.afterHeaderSelect.sel || ''), R.afterHeaderSelect);
  } else { await click('#select-confirmed-button'); await page.waitForTimeout(300); }

  // A8: status change in player view: graveyard player tick pruned, playlist ticks unchanged
  await click('#search-mode-player-btn');
  await page.waitForTimeout(400);
  const qBefore = searchQs.length;
  await click('#status-ranked-btn');
  await page.waitForTimeout(1500);
  R.statusChange = { count: await count(), newSearches: searchQs.length - qBefore, graveShown: (await text()).includes('Alpha Set 4') };
  // player: 4 ranked ticks remain (1 graveyard pruned). playlist 20 all ranked, narrowing local. 20+4-2 = 22
  ok('A8_status_prunes_hidden_player_tick_only', R.statusChange.count === 22 && !R.statusChange.graveShown, R.statusChange);
  await click('#status-all-btn');
  await page.waitForTimeout(1500);
  R.statusBack = { count: await count(), newSearches: searchQs.length - qBefore };
  await shot('5_after_status');

  // A5: new player search (bravo) replaces alpha, playlist untouched
  const playlistCountBefore = await count(); // includes alpha
  await submit('https://osu.ppy.sh/users/515151');
  await page.waitForFunction(() => document.body.innerText.includes('Bravo Set 0'), null, { timeout: 20000 });
  await page.waitForTimeout(600);
  const t5 = await text();
  R.afterBravo = { count: await count(), alphaGone: !t5.includes('Alpha Set 0') && !t5.includes('alpha'), bravo: t5.includes('bravo') };
  ok('A5_new_player_replaces_old', R.afterBravo.alphaGone && R.afterBravo.bravo && R.afterBravo.count === playlistCountBefore - 4, { ...R.afterBravo, playlistCountBefore });
  await shot('6_bravo');
  await clickText('^Select All \\(5\\)$');
  await page.waitForTimeout(300);
  ok('A3_union_bravo', (await count()) === playlistCountBefore - 4 + 5, await count());

  // A6: playlist append (rows exist) keeps player; append adds rows
  await click('#search-mode-songs-btn');
  await page.waitForTimeout(300);
  await submit('https://open.spotify.com/playlist/Cthree');
  await page.waitForFunction(() => /Cthree/.test(document.body.innerText) || /30 /.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
  R.afterAppend = { count: await count(), text: (await text()).match(/\d+\s*Songs?[^\n]*/)?.[0], sel: await selText() };
  await shot('7_after_append');
  await click('#search-mode-player-btn');
  await page.waitForTimeout(400);
  ok('A6_append_keeps_player', (await text()).includes('Bravo Set 0') && /Deselect All/.test(await text()), R.afterAppend);

  // ZIP from player view: fetches the union once each
  mirrorIds.length = 0;
  const expectedN = await count();
  const dl = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await clickText('ZIP');
  await page.waitForFunction(() => /ZIP|saved|Download completed|skipped/i.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
  const d = await dl;
  await page.waitForTimeout(1500);
  R.zip = { expectedN, requested: mirrorIds.length, uniq: new Set(mirrorIds).size, file: d ? d.suggestedFilename() : null };
  ok('A3_zip_fetches_union_once', mirrorIds.length === expectedN && new Set(mirrorIds).size === expectedN, R.zip);

  // A6: player trash keeps playlist; playlist trash keeps player
  const beforeTrash = await count();
  await click('button[title="Clear player results"]');
  await page.waitForTimeout(400);
  R.afterPlayerTrash = { count: await count(), before: beforeTrash };
  await click('#search-mode-songs-btn');
  await page.waitForTimeout(300);
  ok('A6_player_trash_keeps_playlist', (await rowsVisible('Aone Song')).length > 0 && R.afterPlayerTrash.count === beforeTrash - 5, R.afterPlayerTrash);
  await shot('8_after_player_trash');

  R.console = log; R.leaked = leaked; R.searchCount = searchQs.length;
  await ctx.close(); return R;
}

// A9: pacer: a player lookup during a playlist Search All does not stop playlist requests
async function runPacer(browser, zipBuf) {
  const R = { name: 'pacer', checks: {} }; const searchQs = [];
  const ok = (k, v, detail) => { R.checks[k] = { pass: !!v, ...(detail === undefined ? {} : { detail }) }; };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await ctx.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.includes('/api/playlist')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(playlist('Dfour', 30)) });
    if (u.includes('/api/osu/player/beatmaps')) {
      const items = Array.from({ length: 3 }, (_, i) => ({ beatmapset: mkSet(SHARED + i, `Alpha Set ${i}`), meta: {} }));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'best', items, fetched: 3, total: 3 }) }); }
    if (u.includes('/api/osu/player')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'profile', user: users[424242] }) });
    if (u.includes('/api/osu/search')) {
      const q = new URL(u).searchParams.get('q') || 'x'; searchQs.push(q);
      await new Promise((res) => setTimeout(res, 500));
      const i = Number(q.match(/Song (\d+)/)?.[1] || 0);
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, query: q, total: 1, bestScore: 200, beatmapsets: [mkSet(6000000 + i, q)], isDemo: false, rejection: null, artistConfidence: 'high' }) }); }
    if (u.includes('ppy.sh')) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return r.continue();
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 30000 });
  await page.fill('#playlist-url-input', 'https://open.spotify.com/playlist/Dfour');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForFunction(() => /Download(?: All)? \(10\)/.test(document.body.innerText), null, { timeout: 30000 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && /Search All/i.test(e.innerText)); b.click(); });
  await page.waitForTimeout(1200);
  const mid = searchQs.length;
  await page.evaluate(() => document.querySelector('#search-mode-player-btn').click());
  await page.fill('#playlist-url-input', 'https://osu.ppy.sh/users/424242');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForFunction(() => document.body.innerText.includes('Alpha Set 0'), null, { timeout: 20000 });
  await page.waitForFunction(() => /Download(?: All)? \(30\)/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
  const txt = await page.evaluate(() => document.body.innerText);
  R.detail = { mid, total: searchQs.length, uniq: new Set(searchQs).size, count: txt.match(/Download(?: All)? \((\d+)\)/)?.[1] };
  // 30 playlist + 0 player ticks... player sets unticked -> 30
  ok('A9_player_lookup_keeps_search_all_running', new Set(searchQs).size === 30 && mid < 30, R.detail);
  await page.screenshot({ path: path.join(OUT, 'acc_pacer_player_view.png') });
  await ctx.close(); return R;
}

(async () => {
  const zip = new JSZip(); zip.file('stub.osu', require('crypto').randomBytes(16 * 1024));
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const results = [];
  const guard = setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(2); }, 420000);
  for (const [n, vp] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 375, height: 812 }]]) {
    const holder = {};
    try { results.push(await run(browser, n, vp, zipBuf, holder)); } catch (e) { results.push({ name: n, partial: holder.R, error: String(e && e.stack || e) }); }
  }
  try { results.push(await runPacer(browser, zipBuf)); } catch (e) { results.push({ name: 'pacer', error: String(e && e.stack || e) }); }
  clearTimeout(guard);
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'acc-results.json'), JSON.stringify(results, null, 2));
  for (const r of results) {
    if (r.error) { console.log('ERROR', r.name, r.error); continue; }
    const failed = Object.entries(r.checks).filter(([, v]) => !v.pass);
    console.log(r.name, `${Object.keys(r.checks).length - failed.length}/${Object.keys(r.checks).length} pass`, failed.length ? JSON.stringify(failed) : '', 'console:', (r.console || []).length, 'leaked:', (r.leaked || []).length);
  }
})();
