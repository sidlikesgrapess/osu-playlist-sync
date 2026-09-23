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

const BENCH = new URL('../bench/', import.meta.url);
const labels = JSON.parse(readFileSync(new URL('labels.json', BENCH), 'utf8'));
const SUPPLEMENT_FILE = new URL('./fixtures/replay-supplement.json', import.meta.url);
const supplement = existsSync(SUPPLEMENT_FILE)
  ? JSON.parse(readFileSync(SUPPLEMENT_FILE, 'utf8')).byQuery || {}
  : {};

// (fixture, query) pairs allowed to go unanswered, each with its reason.
// Temporary: the two queries F-28's cleaner newly sends for colon-title, which
// bench/snapshots never captured. The supplement capture that follows answers them.
const UNCOVERED_ALLOWED = [
  { fixture: 'colon-title', query: 'ASIAN KUNG-FU GENERATION Re:Re', reason: 'new F-28 query, capture pending' },
  { fixture: 'colon-title', query: 'Re:Re', reason: 'new F-28 query, capture pending' },
];

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

  for (const snap of loadSnapshots()) {
    const f = snap.fixture;
    const log = [];
    installStub(answerFor(snap), log);
    const song = songFor(f);
    const r = await osu.searchOsuBeatmaps(...searchArgsFor(song));

    calls += log.length;
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
  return { tally, uncovered, rows, calls, probes };
}

test('check R: the real matcher over every fixture', async () => {
  const run = await replayAll();
  console.log('check R tally', JSON.stringify(run.tally));
  console.log(`check R calls ${run.calls} (probes ${run.probes})`);
  console.log(`check R uncovered ${run.uncovered.length}`);
  for (const u of run.uncovered) console.log(`  uncovered ${u.fixture} :: ${JSON.stringify(u.query)}`);
  for (const row of run.rows) console.log(`  ${row}`);

  // 30 until the supplement answers colon-title's new queries; then 31.
  assert.ok(run.tally.hit >= 30, `hit ${run.tally.hit}`);
  assert.equal(run.tally.wrongArtist, 0);
  assert.ok(run.tally.correctAbstain >= 6, `correctAbstain ${run.tally.correctAbstain}`);
  const allowed = new Set(UNCOVERED_ALLOWED.map(a => `${a.fixture}\u0000${a.query}`));
  const stray = run.uncovered.filter(u => !allowed.has(`${u.fixture}\u0000${u.query}`));
  assert.deepEqual(stray, [], 'uncovered queries not on the allow-list');
  assert.ok(run.calls <= MAX_CALLS, `calls ${run.calls} > ${MAX_CALLS}`);
});
