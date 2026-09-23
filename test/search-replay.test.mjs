// Check R (REBUILD_PLAN.md section 3): the real searchOsuBeatmaps, replayed offline.
//
// `npm run bench` replays a model of the matcher; this replays the matcher itself, fed the
// params page.js sends for each fixture, with the queries a live cleanSongTitle produces
// (never the snapshot's stored `cleaned`, which predates F-28). fetch is stubbed read-only
// from bench/snapshots and bench/probes, then test/fixtures/replay-supplement.json. A
// request nothing answers gets an empty 200 page and is counted, printed, and has to be on
// UNCOVERED_ALLOWED, so a change can never quietly send a query the capture never saw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

process.env.OSU_CLIENT_ID = 'replay-stub';
process.env.OSU_CLIENT_SECRET = 'replay-stub';

const { loadSnapshots, artistKey, slug } = await import('../bench/pool.mjs');
const { cleanSongTitle } = await import('../src/lib/titleCleaner.js');
const { isRankedStatus, isAutoSelectable } = await import('../src/lib/beatmapFormat.js');
const osu = await import('../src/lib/osu.js');
const { UA_PROFILES } = await import('../src/lib/http.js');

const BENCH = new URL('../bench/', import.meta.url);
const labels = JSON.parse(readFileSync(new URL('labels.json', BENCH), 'utf8'));
const SUPPLEMENT_FILE = new URL('./fixtures/replay-supplement.json', import.meta.url);
const supplement = existsSync(SUPPLEMENT_FILE)
  ? JSON.parse(readFileSync(SUPPLEMENT_FILE, 'utf8')).byQuery || {}
  : {};

// (fixture, query) pairs allowed to go unanswered, each with its reason.
const UNCOVERED_ALLOWED = [];

// The first real post-F-28 run's own count (recorded in that commit). Never the bench
// model's 55 or the hybrid spike's 56.
const MAX_CALLS = 57;

const STRUCTURED = new Set(['spotify', 'apple']);

function readProbe(artist) {
  const file = new URL(`probes/${slug(artist)}.json`, BENCH);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).sets || [] : null;
}

/** The song extractors.js would build for this fixture. */
function songFor(fixture, overrides = {}) {
  const raw = { title: fixture.rawTitle, channelTitle: fixture.channelTitle || '', ...overrides };
  const structured = STRUCTURED.has(fixture.source);
  const cleaned = cleanSongTitle(raw.title, raw.channelTitle, {
    source: fixture.source,
    ...(structured ? { providerArtist: raw.channelTitle || '' } : {}),
  });
  return {
    ...raw,
    source: fixture.source,
    cleanQuery: cleaned.cleanQuery,
    extractedArtist: cleaned.artist,
    artistFromTitle: cleaned.artistFromTitle,
    extractedTitle: cleaned.title,
    fallbacks: cleaned.fallbacks,
    queries: cleaned.queries,
  };
}

/** What page.js sends to /api/osu/search, as the route hands it to searchOsuBeatmaps. */
function searchArgsFor(song, { status = 'any', strictness = 50, mode = 'all' } = {}) {
  const extra = Array.from(new Set([...(song.fallbacks || []), ...(song.queries || [])]));
  return [song.cleanQuery || song.title, {
    title: song.extractedTitle || song.title || '',
    artist: song.extractedArtist || song.channelTitle || '',
    queries: extra,
    mode,
    status,
    strictness,
    source: song.source || '',
    artistFromTitle: Boolean(song.artistFromTitle),
  }];
}

/**
 * Installs the stub. `answer(q)` returns the sets for a search query or undefined when
 * nothing covers it; probes are answered from bench/probes.
 */
function installStub(answer, log) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/oauth/token')) return json({ access_token: 'replay', expires_in: 86400 });
    const q = u.searchParams.get('q') || '';
    const entry = { q, s: u.searchParams.get('s'), probe: q.startsWith('artist='), ua: init.headers?.['User-Agent'] };
    log.push(entry);
    if (entry.probe) {
      const sets = readProbe(q.slice('artist='.length));
      if (!sets) { entry.uncovered = true; return json({ beatmapsets: [] }); }
      return json({ beatmapsets: sets });
    }
    const sets = answer(q);
    if (sets === undefined) { entry.uncovered = true; return json({ beatmapsets: [] }); }
    return json({ beatmapsets: sets });
  };
}

function answerFor(snap) {
  return (q) => snap.byQuery[q]?.sets ?? supplement[q]?.sets;
}

async function replayAll() {
  const tally = { hit: 0, wrongArtist: 0, correctAbstain: 0, miss: 0, unreachable: 0, unlabelled: 0 };
  const uncovered = [];
  const rows = [];
  let calls = 0;
  let probes = 0;
  const userAgents = new Set();

  for (const snap of loadSnapshots()) {
    const f = snap.fixture;
    const log = [];
    installStub(answerFor(snap), log);
    const song = songFor(f);
    const r = await osu.searchOsuBeatmaps(...searchArgsFor(song));

    calls += log.length;
    for (const e of log) userAgents.add(e.ua);
    probes += log.filter(e => e.probe).length;
    for (const e of log.filter(e => e.uncovered)) uncovered.push({ fixture: f.id, query: e.q });

    const raw = new Map();
    for (const b of Object.values(snap.byQuery)) for (const s of b.sets || []) raw.set(s.id, s);
    for (const b of Object.values(supplement)) for (const s of b.sets || []) raw.set(s.id, s);
    for (const s of readProbe(song.extractedArtist || f.channelTitle || '') || []) raw.set(s.id, s);
    const labelOf = (s) => labels[artistKey(f.id, raw.get(s.id) || s)] || 'unknown';

    const accepted = (r.beatmapsets || []).filter(isAutoSelectable);
    let kind;
    if (accepted.length === 0) {
      if (f.expect === 'none' || f.expect === 'match-or-none') kind = 'correctAbstain';
      else kind = log.some(e => e.uncovered) ? 'unreachable' : 'miss';
    } else {
      const label = labelOf(accepted[0]);
      if (label === 'unknown') kind = 'unlabelled';
      else if (label === 'different' || f.expect === 'none') kind = 'wrongArtist';
      else kind = 'hit';
    }
    tally[kind] += 1;
    if (kind !== 'hit' && kind !== 'correctAbstain') {
      rows.push(`${f.id}: ${kind} (${accepted[0] ? `${accepted[0].artist} - ${accepted[0].title}` : `rejection=${r.rejection?.kind}`})`);
    }
  }
  return { tally, uncovered, rows, calls, probes, userAgents };
}

test('check R: the real matcher over every fixture', async () => {
  const run = await replayAll();
  console.log('check R tally', JSON.stringify(run.tally));
  console.log(`check R calls ${run.calls} (probes ${run.probes})`);
  console.log(`check R uncovered ${run.uncovered.length}`);
  for (const u of run.uncovered) console.log(`  uncovered ${u.fixture} :: ${JSON.stringify(u.query)}`);
  for (const row of run.rows) console.log(`  ${row}`);

  assert.ok(run.tally.hit >= 31, `hit ${run.tally.hit}`);
  assert.equal(run.tally.wrongArtist, 0);
  assert.ok(run.tally.correctAbstain >= 6, `correctAbstain ${run.tally.correctAbstain}`);
  const allowed = new Set(UNCOVERED_ALLOWED.map(a => `${a.fixture}\u0000${a.query}`));
  const stray = run.uncovered.filter(u => !allowed.has(`${u.fixture}\u0000${u.query}`));
  assert.deepEqual(stray, [], 'uncovered queries not on the allow-list');
  assert.ok(run.calls <= MAX_CALLS, `calls ${run.calls} > ${MAX_CALLS}`);
  // Every search and probe goes through osuApiGet, so every one carries the server UA.
  assert.deepEqual([...run.userAgents], [UA_PROFILES.server]);
});

test('F-14: 50 fallbacks make at most 4 upstream queries, and the bare title is one of them', async () => {
  const log = [];
  installStub(() => [], log);
  const queries = Array.from({ length: 50 }, (_, i) => `fallback ${i}`);
  await osu.searchOsuBeatmaps('Some Artist Some Title', {
    title: 'Some Title', artist: 'Some Artist', queries, status: 'any', strictness: 50, source: 'spotify',
  });
  const searches = log.filter(e => !e.probe).map(e => e.q);
  assert.ok(searches.length <= 4, `${searches.length} queries: ${searches.join(' | ')}`);
  assert.ok(searches.includes('Some Title'));
  assert.deepEqual(searches.slice(0, 3), ['Some Artist Some Title', 'fallback 0', 'fallback 1']);
});

test('F-33: under none trust a close title is salvaged as titleOnly, never artistOverride', async () => {
  const set = (id, artist, title) => ({
    id, artist, artist_unicode: artist, title, title_unicode: title, tags: '', status: 'graveyard', favourite_count: 0,
  });
  const log = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/oauth/token')) return Response.json({ access_token: 'replay', expires_in: 86400 });
    const q = u.searchParams.get('q') || '';
    log.push(q);
    // The probe finds sets, but none by this name: the string is not an artist.
    if (q.startsWith('artist=')) return Response.json({ beatmapsets: [set(9001, 'Salvage Channel Official Mixes', 'Other')] });
    return Response.json({ beatmapsets: [set(9002, 'Alan Walker', 'Faded Extended Mix')] });
  };
  // Strictness 90: the 0.92 containment title clears the salvage floor but not the cutoff.
  const r = await osu.searchOsuBeatmaps('Salvage Channel Faded', {
    title: 'Faded', artist: 'Salvage Channel', queries: [], status: 'any', strictness: 90, source: 'youtube',
  });
  assert.equal(r.artistConfidence, 'none');
  assert.deepEqual(r.rejection, { kind: 'artist-unknown', artist: 'Salvage Channel' });
  assert.equal(r.beatmapsets.length, 1);
  const [salvaged] = r.beatmapsets;
  assert.equal(salvaged.id, 9002);
  assert.equal(salvaged.titleOnly, true);
  assert.equal(salvaged.matchScore, null);
  assert.equal(salvaged.artistOverride, undefined);
  assert.equal(isAutoSelectable(salvaged), false);
  assert.ok(log.some(q => q.startsWith('artist=')), 'the probe decided the trust');
});

test('F-09: a 429 on any variant throws .status 429, so a partial pool is never returned', async () => {
  const log = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/oauth/token')) return Response.json({ access_token: 'replay', expires_in: 86400 });
    log.push(u.searchParams.get('q'));
    if (log.length === 1) {
      return Response.json({ beatmapsets: [{ id: 1, artist: 'Other', title: 'Rate Limit Song', status: 'ranked' }] });
    }
    return new Response('slow down', { status: 429, headers: { 'retry-after': '30' } });
  };
  await assert.rejects(
    osu.searchOsuBeatmaps('Rate Artist Rate Limit Song', {
      title: 'Rate Limit Song', artist: 'Rate Artist', queries: [], status: 'any', strictness: 50, source: 'youtube',
    }),
    (e) => e.status === 429 && e.retryAfter === '30',
  );
  assert.equal(log.length, 2, 'the loop stops at the 429');
});

test('F-09: when every variant fails for another reason the failure is thrown, not a no-match', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/oauth/token')) return Response.json({ access_token: 'replay', expires_in: 86400 });
    return new Response('boom', { status: 503 });
  };
  await assert.rejects(
    osu.searchOsuBeatmaps('Down Song', { title: 'Down Song', artist: '', queries: [], status: 'any', strictness: 50 }),
    (e) => e.status === 503,
  );
});

test('F-08: at status ranked every search sends s=leaderboard and every returned set is Ranked & Loved', async () => {
  let searches = 0;
  let returned = 0;
  for (const snap of loadSnapshots()) {
    const log = [];
    installStub(answerFor(snap), log);
    const r = await osu.searchOsuBeatmaps(...searchArgsFor(songFor(snap.fixture), { status: 'ranked' }));
    for (const e of log.filter(e => !e.probe)) {
      searches += 1;
      assert.equal(e.s, 'leaderboard', `${snap.fixture.id} :: ${e.q}`);
    }
    // The captures are s=any, so the stub hands back unranked sets too: the pool must drop them.
    for (const set of r.beatmapsets || []) {
      returned += 1;
      assert.ok(isRankedStatus(set.status), `${snap.fixture.id}: ${set.id} is ${set.status}`);
    }
  }
  assert.ok(searches > 0 && returned > 0, `searches ${searches}, returned ${returned}`);
});

// Recorded as todo, not passing: this fails today and the fix is not this matcher's. With no
// artist field the splitter runs (as 2.1 item 7 intends) and pattern C (titleCleaner.js:222)
// turns "Re:Re:" into artist "Re", title "Re". The probe for "Re" finds sets whose own artist
// is "RE", so resolveArtistTrust rightly calls it a real artist (trust high) and the gate
// refuses the ASIAN KUNG-FU GENERATION set as wrong-artist. Routing a title-split artist
// through resolveArtistTrust cannot help when the guess happens to be a real mapped artist;
// the split itself is the defect. It stays here so the case is seen until the cleaner is fixed.
test('F-28: an Apple track with no provider artist is split for recall but never refused on that guess', {
  todo: 'the colon split of "Re:Re:" yields a real osu! artist, so the gate refuses (cleaner defect)',
}, async () => {
  const snap = loadSnapshots().find(s => s.fixture.id === 'colon-title');
  const fixture = { ...snap.fixture, source: 'apple' };
  const song = songFor(fixture, { channelTitle: '' });
  assert.equal(song.artistFromTitle, true, 'the splitter ran, since there was no artist field');
  const log = [];
  installStub(answerFor(snap), log);
  const r = await osu.searchOsuBeatmaps(...searchArgsFor(song));
  assert.notEqual(r.rejection?.kind, 'wrong-artist');
  assert.ok(log.some(e => e.probe), 'the guessed artist went through resolveArtistTrust');
});
