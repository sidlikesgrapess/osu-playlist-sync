// Item 10 sanity check: Change Player is a back step, the trash is the one clear. Every
// external call is stubbed (playlist, osu! search, player, beatmaps, images), so nothing
// leaves the machine. Run: NODE_PATH="$(npm root -g)" node todo-run/shots/10/verify.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = __dirname; const BASE = 'http://localhost:3000';
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(OUT, '..', '03', 'search-cache.json'), 'utf8')).beatmapsets[0];
const N = 12; // page size 10, so 10 playlist rows get searched and auto ticked

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const mkSet = (id, title) => ({ ...TEMPLATE, id, title, titleUnicode: title, artistOverride: false, titleOnly: false,
  previewUrl: `https://b.ppy.sh/preview/${id}.mp3`,
  covers: Object.fromEntries(Object.keys(TEMPLATE.covers).map((k) => [k, `https://assets.ppy.sh/beatmaps/${id}/covers/${k}.jpg`])) });
const playlist = (tag) => ({ success: true, platform: 'spotify', playlistId: tag, playlistTitle: `Stub ${tag}`, isSingleTrack: false,
  returnedCount: N, loadedCount: N, unavailableCount: 0, truncated: false, playlistLength: N,
  songs: Array.from({ length: N }, (_, i) => ({ id: `${tag}_${i}`, index: i, title: `${tag} Song ${i}`, channelTitle: `${tag} Artist ${i}`,
    thumbnail: '', duration: '3:00', source: 'spotify', cleanQuery: `${tag} Artist ${i} ${tag} Song ${i}`,
    extractedTitle: `${tag} Song ${i}`, extractedArtist: `${tag} Artist ${i}`, fallbacks: [], queries: [] })) });
const mkUser = (id, username) => ({ id, username, avatarUrl: `https://a.ppy.sh/${id}`, countryCode: 'JP', coverUrl: null, globalRank: id, countryRank: 1, pp: 1000, playCount: 10, counts: { best: 6, most_played: 0, favourite: 0 } });
const USERS = { 1001: mkUser(1001, 'userA'), 1002: mkUser(1002, 'userB'), 1003: mkUser(1003, 'userC') };
const DASH = /\s[-–—]\s|[–—]/;

async function run(browser, name, viewport) {
  const R = { name, checks: {} }; const log = []; const leaked = [];
  const calls = { q: 0, userId: 0, beatmaps: 0 };
  const ok = (k, v, detail) => { R.checks[k] = { pass: !!v, ...(detail === undefined ? {} : { detail }) }; };
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem('osu_sfx_enabled', 'true'); } catch (e) {}
    // playClick is the only sound that uses a triangle oscillator: count those.
    window.__clicks = 0;
    const desc = Object.getOwnPropertyDescriptor(OscillatorNode.prototype, 'type');
    Object.defineProperty(OscillatorNode.prototype, 'type', { configurable: true, get() { return desc.get.call(this); },
      set(v) { if (v === 'triangle') window.__clicks += 1; desc.set.call(this, v); } });
  });
  page.on('console', (m) => { if (m.type() === 'error') log.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  await ctx.route('**/*', async (r) => {
    const u = r.request().url();
    const json = (body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.includes('/api/playlist')) { const tag = decodeURIComponent(u).match(/playlist\/(\w+)/)?.[1] || 'X'; return json(playlist(tag)); }
    if (u.includes('/api/osu/player/beatmaps')) {
      calls.beatmaps += 1;
      const uid = Number(new URL(u).searchParams.get('userId')) || 1;
      const items = Array.from({ length: 6 }, (_, i) => ({ beatmapset: mkSet(uid * 100 + i, `P${uid} Set ${i}`), meta: { pp: 500, rank: 'S', accuracy: 99, mods: [] } }));
      return json({ type: 'best', items, fetched: 6, total: 6 }); }
    if (u.includes('/api/osu/player')) {
      const sp = new URL(u).searchParams;
      if (sp.get('userId')) { calls.userId += 1; return json({ type: 'profile', user: USERS[sp.get('userId')] }); }
      calls.q += 1;
      const q = sp.get('q') || ''; const pg = Number(sp.get('page') || 1);
      const m = q.match(/users\/(\d+)/); if (m) return json({ type: 'profile', user: USERS[m[1]] });
      // 45 found, so three pages; pages 2 and 3 carry a page marker in the names.
      const users = Object.values(USERS).map((x) => (pg === 1 ? x : { ...x, id: x.id + pg * 10, username: `${x.username}p${pg}` }));
      return json({ type: 'results', users, total: 45, page: pg }); }
    if (u.includes('/api/osu/search')) {
      const q = new URL(u).searchParams.get('q') || 'x'; const i = Number(q.match(/Song (\d+)/)?.[1] || 0);
      return json({ success: true, query: q, total: 1, bestScore: 200, beatmapsets: [mkSet(8000000 + i, q)], isDemo: false, rejection: null, artistConfidence: 'high' }); }
    if (u.includes('ppy.sh')) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.includes('fonts.g')) leaked.push(u);
    return r.continue();
  });

  const text = () => page.evaluate(() => document.body.innerText);
  const clicks = () => page.evaluate(() => window.__clicks);
  const clickText = (re) => page.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && r.test(e.innerText.trim())); if (!b) throw new Error('no button ' + src); b.click(); }, re);
  const clickSel = (sel) => page.evaluate((s) => { const b = [...document.querySelectorAll(s)].find((e) => e.offsetParent !== null); if (!b) throw new Error('no ' + s); b.click(); }, sel);
  const count = async () => { const m = (await text()).match(/Download(?: All)? \((\d+)\)/); return m ? Number(m[1]) : null; };
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${name}_${n}.png`), fullPage: false });
  const settle = (ms = 500) => page.waitForTimeout(ms);
  const search = async (value) => { await page.fill('#playlist-url-input', value); await page.press('#playlist-url-input', 'Enter'); };
  const waitText = (s) => page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), s, { timeout: 20000 });
  const trash = (label) => `button[aria-label="${label}"]`;
  const labelOf = (sel) => page.evaluate((s) => { const b = document.querySelector(s); return b && { title: b.title, aria: b.getAttribute('aria-label') }; }, sel);
  const changeTitle = () => page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Change Player/.test(b.innerText))?.title);

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 30000 });
  await settle(800);

  // a. Playlist: 10 auto ticks.
  await search('https://open.spotify.com/playlist/Aone');
  await page.waitForFunction(() => /Download(?: All)? \(10\)/.test(document.body.innerText), null, { timeout: 30000 });
  await settle(800);
  ok('a_playlist_ticks_10', (await count()) === 10, await count());

  // b. Player: name search, pick userA, tick all 6. Union 16.
  await clickSel('#search-mode-player-btn'); await settle();
  await search('user');
  await waitText('45 players found'); await settle();
  await clickText('^userA'); await waitText('P1001 Set 0'); await settle(800);
  await clickText('^Select All \\(6\\)$'); await settle(400);
  ok('b_union_16', (await count()) === 16, await count());
  const title = await changeTitle();
  ok('b_change_player_title', title === 'Back to player results', title);
  await shot('1_profile');

  // c. Change Player: the list is back, nothing refetched, ticks kept, one click.
  let before = { ...calls }; let c0 = await clicks();
  await clickText('^Change Player$'); await settle();
  const t = await text();
  ok('c_list_back', t.toLowerCase().includes('45 players found') && t.includes('userB'));
  ok('c_profile_hidden', !t.includes('P1001 Set 0') && !/Change Player/.test(t));
  ok('c_no_requests', JSON.stringify(calls) === JSON.stringify(before), calls);
  ok('c_count_kept_16', (await count()) === 16, await count());
  ok('c_one_click', (await clicks()) - c0 === 1, (await clicks()) - c0);
  ok('c_back_chip', t.includes('Back to userA'));
  await shot('2_back_to_results');

  // i1. Paging with a retained profile keeps it, including paging back to page 1.
  await page.evaluate(() => { const s = [...document.querySelectorAll('span')].find((e) => /^Page 1 of/.test(e.innerText)); s.nextElementSibling.click(); });
  await waitText('userAp2'); await settle();
  ok('i_paging_keeps_profile', (await text()).includes('Back to userA') && (await count()) === 16, await count());
  await page.evaluate(() => { const s = [...document.querySelectorAll('span')].find((e) => /^Page 2 of/.test(e.innerText)); s.previousElementSibling.click(); });
  await page.waitForFunction(() => /Page 1 of/.test(document.body.innerText) && !/userAp2/.test(document.body.innerText), null, { timeout: 20000 }); await settle();
  ok('i_paging_back_to_1_keeps_profile', (await text()).includes('Back to userA') && (await count()) === 16, await count());

  // d. Pick userA again: no refetch, ticks and open section back.
  before = { ...calls }; c0 = await clicks();
  await clickText('^userA'); await settle(600);
  ok('d_same_player_no_requests', JSON.stringify(calls) === JSON.stringify(before), calls);
  ok('d_sets_back', (await text()).includes('P1001 Set 5'));
  ok('d_ticks_back_16', (await count()) === 16, await count());
  ok('d_one_click', (await clicks()) - c0 === 1, (await clicks()) - c0);

  // e. Change Player, pick userB: player side replaced, playlist ticks stay.
  await clickText('^Change Player$'); await settle();
  before = { ...calls };
  await clickText('^userB'); await waitText('P1002 Set 0'); await settle(800);
  ok('e_new_player_fetched', calls.userId === before.userId + 1 && calls.beatmaps === before.beatmaps + 1, calls);
  ok('e_player_ticks_reset', (await count()) === 10, await count());
  ok('e_no_chip', !(await text()).includes('Back to'));
  await clickText('^Select All \\(6\\)$'); await settle(400);
  await shot('3_player_b');

  // f. Player trash: title, one click, clears only the player.
  const pt = await labelOf(trash('Clear player results'));
  ok('f_player_trash_label', pt && pt.title === 'Clear player results' && pt.aria === 'Clear player results', pt);
  c0 = await clicks();
  await clickSel(trash('Clear player results')); await settle();
  const tf = await text();
  ok('f_one_click', (await clicks()) - c0 === 1, (await clicks()) - c0);
  ok('f_player_empty', !tf.includes('P1002') && !tf.toLowerCase().includes('players found') && !tf.includes('Back to'));
  ok('f_playlist_ticks_kept', (await count()) === 10, await count());
  await shot('4_after_player_trash');

  // g. Playlist trash: title, one click, clears only the playlist.
  await search('user'); await waitText('45 players found'); await settle();
  await clickText('^userA'); await waitText('P1001 Set 0'); await settle(800);
  await clickText('^Select All \\(6\\)$'); await settle(400);
  await clickSel('#search-mode-songs-btn'); await settle();
  const lt = await labelOf(trash('Clear playlist results'));
  ok('g_playlist_trash_label', lt && lt.title === 'Clear playlist results' && lt.aria === 'Clear playlist results', lt);
  c0 = await clicks();
  await clickSel(trash('Clear playlist results')); await settle();
  ok('g_one_click', (await clicks()) - c0 === 1, (await clicks()) - c0);
  ok('g_player_ticks_kept', (await count()) === 6, await count());
  await clickSel('#search-mode-player-btn'); await settle();
  ok('g_player_untouched', (await text()).includes('P1001 Set 0'));

  // h. Pasted link: Change Player shows the empty view with the chip; the chip brings it back.
  await search('https://osu.ppy.sh/users/1003'); await waitText('P1003 Set 0'); await settle(800);
  const title2 = await changeTitle();
  ok('h_title_no_results', title2 === 'Back to player search', title2);
  await clickText('^Select All \\(6\\)$'); await settle(400);
  c0 = await clicks(); before = { ...calls };
  await clickText('^Change Player$'); await settle();
  const th = await text();
  ok('h_empty_with_chip', th.includes('Back to userC') && !th.includes('P1003 Set 0') && !th.toLowerCase().includes('players found'));
  ok('h_count_kept', (await count()) === 6, await count());
  await shot('5_pasted_link_back');
  await clickText('^Back to userC$'); await settle();
  ok('h_chip_restores', (await text()).includes('P1003 Set 0') && (await count()) === 6 && JSON.stringify(calls) === JSON.stringify(before), calls);
  ok('h_clicks_2', (await clicks()) - c0 === 2, (await clicks()) - c0);

  // i2. A page 1 name search drops the retained profile.
  await clickText('^Change Player$'); await settle();
  await search('user'); await waitText('45 players found'); await settle();
  const ti = await text();
  ok('i_new_search_drops_profile', !ti.includes('Back to') && (await count()) === null, await count());
  await shot('6_new_search');

  // j. No dash punctuation in the copy this item added.
  const newCopy = ['Back to player results', 'Back to player search', 'Back to userC', 'Clear player results', 'Clear playlist results', title, title2];
  ok('j_no_dashes', newCopy.every((s) => !DASH.test(s || '')), newCopy);

  ok('z_no_console_errors', log.length === 0, log);
  ok('z_no_leaks', leaked.length === 0, leaked);
  R.calls = calls;
  await ctx.close();
  return R;
}

(async () => {
  const hard = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 240000);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const results = [];
  try {
    results.push(await run(browser, 'desktop', { width: 1280, height: 800 }));
    results.push(await run(browser, 'phone', { width: 375, height: 812 }));
  } catch (e) { results.push({ error: String((e && e.stack) || e) }); }
  await browser.close(); clearTimeout(hard);
  fs.writeFileSync(path.join(OUT, 'verify-results.json'), JSON.stringify(results, null, 2));
  for (const r of results) {
    if (r.error) { console.log('ERROR', r.error); continue; }
    const all = Object.entries(r.checks); const fails = all.filter(([, v]) => !v.pass);
    console.log(`${r.name}: ${all.length - fails.length}/${all.length}`, JSON.stringify(r.calls));
    for (const [k, v] of fails) console.log('  FAIL', k, JSON.stringify(v.detail));
  }
})();
