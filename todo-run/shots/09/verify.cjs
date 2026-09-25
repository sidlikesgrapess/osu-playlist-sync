// Item 09 sanity check: one download bar over both result sets. Every external call is
// stubbed (playlist, osu! search, player, mirrors, previews), so nothing leaves the machine.
// Run: NODE_PATH="$(npm root -g)" node todo-run/shots/09/verify.cjs
const { chromium } = require('playwright');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(OUT, '..', '03', 'search-cache.json'), 'utf8')).beatmapsets[0];
const N = 12; // page size 10, so 10 rows get searched and auto ticked
const SHARED = 9000000; // player sets are SHARED+0..4; playlist songs 0 and 1 match SHARED+0 and +1

function wav(seconds) {
  const rate = 8000; const n = Math.round(rate * seconds); const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36);
  b.writeUInt32LE(n, 40); b.fill(128, 44); return b;
}
const LONG = wav(30);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const mkSet = (id, title) => ({ ...TEMPLATE, id, title, titleUnicode: title, artistOverride: false, titleOnly: false,
  previewUrl: `https://b.ppy.sh/preview/${id}.mp3`,
  covers: Object.fromEntries(Object.keys(TEMPLATE.covers).map((k) => [k, `https://assets.ppy.sh/beatmaps/${id}/covers/${k}.jpg`])) });
const playlist = (tag) => ({ success: true, platform: 'spotify', playlistId: tag, playlistTitle: `Stub ${tag}`, isSingleTrack: false,
  returnedCount: N, loadedCount: N, unavailableCount: 0, truncated: false, playlistLength: N,
  songs: Array.from({ length: N }, (_, i) => ({ id: `${tag}_${i}`, index: i, title: `${tag} Song ${i}`, channelTitle: `${tag} Artist ${i}`,
    thumbnail: '', duration: '3:00', source: 'spotify', cleanQuery: `${tag} Artist ${i} ${tag} Song ${i}`,
    extractedTitle: `${tag} Song ${i}`, extractedArtist: `${tag} Artist ${i}`, fallbacks: [], queries: [] })) });
const user = { id: 424242, username: 'verifier', avatarUrl: null, countryCode: 'JP', coverUrl: null, globalRank: 1, countryRank: 1, pp: 1000, playCount: 10, counts: { best: 5, most_played: 0, favourite: 0 } };

async function run(browser, name, viewport, zipBuf) {
  const R = { name, checks: {} }; const log = []; const leaked = []; const mirrorIds = [];
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
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(playlist(tag)) }); }
    if (u.includes('/api/osu/player/beatmaps')) {
      const items = Array.from({ length: 5 }, (_, i) => ({ beatmapset: mkSet(SHARED + i, `Player Set ${i}`), meta: { pp: 500, rank: 'S', accuracy: 99, mods: [] } }));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'best', items, fetched: 5, total: 5 }) }); }
    if (u.includes('/api/osu/player')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'profile', user }) });
    if (u.includes('/api/osu/search')) {
      const q = new URL(u).searchParams.get('q') || 'x';
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
  const click = (sel, idx = 0) => page.evaluate(([s, i]) => { const els = [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null); if (!els[i]) throw new Error('no ' + s); els[i].click(); }, [sel, idx]);
  const clickText = (re) => page.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && r.test(e.innerText)); if (!b) throw new Error('no button ' + src); b.click(); }, re);
  const count = async () => { const m = (await text()).match(/Download(?: All)? \((\d+)\)/); return m ? Number(m[1]) : null; };
  const note = () => page.evaluate(() => document.querySelector('[data-testid="stats-other-side"]')?.innerText || '');
  const rows = (prefix) => page.evaluate((t) => [...document.querySelectorAll('body *')].filter((e) => e.childElementCount === 0 && e.offsetParent !== null && e.textContent.startsWith(t)).length, prefix);
  const audio = () => page.evaluate(() => window.__audios.map((a) => ({ src: a.getAttribute('src'), paused: a.paused })));
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${name}_${n}.png`), fullPage: false });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 30000 });
  await page.waitForTimeout(800);

  // 1. Playlist: 12 rows, first 10 searched and auto ticked.
  await page.fill('#playlist-url-input', 'https://open.spotify.com/playlist/Aone');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForFunction(() => /Download(?: All)? \(10\)/.test(document.body.innerText), null, { timeout: 30000 });
  await page.waitForTimeout(800);
  ok('1_playlist_ticks_10', (await count()) === 10, await count());
  // Untick one playlist row so the preserved selection is not simply "everything".
  await click('[id^="checkbox-song-Aone_9"], [id^="checkbox-mobile-song-Aone_9"]');
  await page.waitForTimeout(300);
  ok('1b_playlist_ticks_9', (await count()) === 9, await count());
  await shot('1_playlist');

  // Preview playing in the playlist, to check the view switch releases it (item 04).
  await click('.osu-play-btn');
  await page.waitForFunction(() => window.__audios[0] && !window.__audios[0].paused && window.__audios[0].currentTime > 0, null, { timeout: 12000 }).catch(() => {});
  R.audioBeforeSwitch = await audio();

  // 2. Switch to Player: bar is there, count still 9, note says they come from the playlist.
  await click('#search-mode-player-btn');
  await page.waitForTimeout(600);
  R.audioAfterSwitch = await audio();
  ok('10_switch_stops_preview', R.audioAfterSwitch.length > 0 && R.audioAfterSwitch.every((a) => a.paused && !a.src), R.audioAfterSwitch);
  ok('4_bar_in_empty_player_view', (await count()) === 9, await count());
  ok('4b_note_in_player_view', /Includes 9 ticked in Playlist/.test(await note()), await note());
  ok('2a_playlist_rows_hidden', (await rows('Aone Song')) === 0);

  // 3. Player search, tick all 5 (two of them share a set with playlist rows 0 and 1).
  await page.fill('#playlist-url-input', 'https://osu.ppy.sh/users/424242');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForFunction(() => document.body.innerText.includes('Player Set 0'), null, { timeout: 20000 });
  await page.waitForTimeout(800);
  ok('5_player_search_keeps_playlist_ticks', (await count()) === 9, await count());
  await clickText('^Select All \\(5\\)$');
  await page.waitForTimeout(400);
  // N + M - K = 9 + 5 - 2 = 12
  ok('3_union_dedup_12', (await count()) === 12, await count());
  ok('3b_note_player_view', /Includes 7 ticked in Playlist/.test(await note()), await note());
  await shot('2_player_union');

  // 4. Back to Playlist: rows, ticks and title as they were; the union count holds.
  await click('#search-mode-songs-btn');
  await page.waitForTimeout(600);
  ok('1c_playlist_rows_back', (await rows('Aone Song')) >= 10, await rows('Aone Song'));
  ok('1d_title_back', (await text()).includes('Stub Aone'));
  ok('3c_union_in_playlist_view', (await count()) === 12, await count());
  ok('3d_note_playlist_view', /Includes 3 ticked in Player/.test(await note()), await note());
  const row9 = await page.evaluate(() => { const e = document.querySelector('#checkbox-song-Aone_9, #checkbox-mobile-song-Aone_9'); return e ? (e.checked ?? e.getAttribute('aria-checked')) : 'missing'; });
  R.row9Checked = row9;
  await shot('3_playlist_back');

  // 5. Download the union: 12 distinct sets, each fetched once.
  await clickText('^Download(?: All)? \\(12\\)$');
  await page.waitForFunction(() => /Download completed|skipped/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(500);
  const uniq = new Set(mirrorIds);
  const expected = new Set([...Array.from({ length: 9 }, (_, i) => i < 2 ? SHARED + i : 8000000 + ('A'.charCodeAt(0) * 100) + i), SHARED + 2, SHARED + 3, SHARED + 4]);
  ok('3e_batch_fetches_union_once', uniq.size === 12 && mirrorIds.length === 12 && [...expected].every((id) => uniq.has(id)), { requested: mirrorIds.length, uniq: uniq.size });

  // 6. Player view ticks preserved; section Select All is that section only.
  await click('#search-mode-player-btn');
  await page.waitForTimeout(500);
  ok('2b_player_profile_back', (await text()).includes('Player Set 0'));
  ok('2c_player_ticks_back', /Deselect All/.test(await text()));

  // 7. Trash in the player view clears only the player.
  await click('button[title="Clear player results"]');
  await page.waitForTimeout(500);
  ok('6a_player_trash_only_player', (await count()) === 9 && !(await text()).includes('Player Set 0'), await count());
  // Player back, then playlist trash clears only the playlist.
  await page.fill('#playlist-url-input', 'https://osu.ppy.sh/users/424242');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForFunction(() => document.body.innerText.includes('Player Set 0'), null, { timeout: 20000 });
  await clickText('^Select All \\(5\\)$');
  await page.waitForTimeout(300);
  await click('#search-mode-songs-btn');
  await page.waitForTimeout(400);
  await click('button[title="Clear playlist results"]');
  await page.waitForTimeout(500);
  ok('6b_playlist_trash_only_playlist', (await count()) === 5 && (await rows('Aone Song')) === 0, await count());
  // A playlist search into the empty playlist leaves the player alone.
  await page.fill('#playlist-url-input', 'https://open.spotify.com/playlist/Btwo');
  await page.press('#playlist-url-input', 'Enter');
  await page.waitForFunction(() => document.body.innerText.includes('Btwo Song 0'), null, { timeout: 20000 });
  await page.waitForFunction(() => /Download(?: All)? \(15\)/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  ok('6c_playlist_search_keeps_player', (await count()) === 15, await count());
  await shot('4_after_trash_and_new_playlist');
  await click('#search-mode-player-btn');
  await page.waitForTimeout(400);
  ok('6d_player_still_there', (await text()).includes('Player Set 0'));
  await shot('5_player_after_new_playlist');

  R.console = log; R.leaked = leaked;
  await ctx.close(); return R;
}

(async () => {
  const zip = new JSZip(); zip.file('stub.osu', require('crypto').randomBytes(16 * 1024)); // over MIN_ARCHIVE_BYTES
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const results = [];
  try {
    results.push(await run(browser, 'desktop', { width: 1280, height: 800 }, zipBuf));
    results.push(await run(browser, 'phone', { width: 375, height: 812 }, zipBuf));
  } catch (e) { results.push({ error: String(e && e.stack || e) }); }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2));
  for (const r of results) {
    if (r.error) { console.log('ERROR', r.error); continue; }
    const failed = Object.entries(r.checks).filter(([, v]) => !v.pass);
    console.log(r.name, `${Object.keys(r.checks).length - failed.length}/${Object.keys(r.checks).length} pass`, failed.length ? JSON.stringify(failed) : '', 'console:', r.console.length, 'leaked:', r.leaked.length);
  }
})();
