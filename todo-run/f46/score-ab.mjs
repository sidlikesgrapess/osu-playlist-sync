#!/usr/bin/env node
/**
 * F-46 offline scoring A/B over bench/snapshots (lives outside bench/, changes nothing there).
 *
 *   node todo-run/f46/score-ab.mjs
 *
 * Replays the real searchOsuBeatmaps twice per fixture, with fetch stubbed read-only from
 * bench/snapshots, bench/probes and test/fixtures/replay-supplement.json (as check R does):
 *   A  single title   altTitle '' (scoring on H0 alone, no H1 query)
 *   B  max(H0, H1)    altTitle from the live cleaner (H1 query plus max scoring, tie to H0)
 * and tallies hit / abstain / WRONG with bench/labels.json. A query nothing answers gets an
 * empty page and is listed, so a B result that leans on an unseen answer is visible. Only
 * search calls are counted: artist probes are memoized in osu.js, so B would reuse A's.
 */
import { readFileSync, existsSync } from 'node:fs';

process.env.OSU_CLIENT_ID = 'replay-stub';
process.env.OSU_CLIENT_SECRET = 'replay-stub';

const BENCH = new URL('../../bench/', import.meta.url);
const { loadSnapshots, artistKey, slug } = await import('../../bench/pool.mjs');
const { cleanSongTitle } = await import('../../src/lib/titleCleaner.js');
const { isAutoSelectable } = await import('../../src/lib/beatmapFormat.js');
const osu = await import('../../src/lib/osu.js');

const labels = JSON.parse(readFileSync(new URL('labels.json', BENCH), 'utf8'));
const SUPP = new URL('../../test/fixtures/replay-supplement.json', import.meta.url);
const supplement = existsSync(SUPP) ? JSON.parse(readFileSync(SUPP, 'utf8')).byQuery || {} : {};
const STRUCTURED = new Set(['spotify', 'apple']);

const readProbe = (artist) => {
  const file = new URL(`probes/${slug(artist)}.json`, BENCH);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).sets || [] : null;
};

function install(snap, log) {
  const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/oauth/token')) return json({ access_token: 'replay', expires_in: 86400 });
    const q = u.searchParams.get('q') || '';
    const e = { q, probe: q.startsWith('artist=') };
    log.push(e);
    const sets = e.probe ? readProbe(q.slice(7)) : (snap.byQuery[q]?.sets ?? supplement[q]?.sets);
    if (!sets) e.uncovered = true;
    return json({ beatmapsets: sets || [] });
  };
}

async function runOne(snap, useAlt) {
  const f = snap.fixture;
  const structured = STRUCTURED.has(f.source);
  const c = cleanSongTitle(f.rawTitle, f.channelTitle || '', { source: f.source, ...(structured ? { providerArtist: f.channelTitle || '' } : {}) });
  const log = [];
  install(snap, log);
  const extra = [...new Set([...(c.fallbacks || []), ...(c.queries || [])])];
  const r = await osu.searchOsuBeatmaps(c.cleanQuery || f.rawTitle, {
    title: c.title || f.rawTitle, artist: c.artist || f.channelTitle || '', queries: extra, mode: 'all', status: 'any',
    strictness: 50, source: f.source, artistFromTitle: Boolean(c.artistFromTitle), altTitle: useAlt ? c.altTitle || '' : '',
  });
  const raw = new Map();
  for (const b of [...Object.values(snap.byQuery), ...Object.values(supplement)]) for (const s of b.sets || []) raw.set(s.id, s);
  const top = (r.beatmapsets || []).filter(isAutoSelectable)[0];
  let kind;
  if (!top) kind = f.expect === 'none' || f.expect === 'match-or-none' ? 'abstain' : 'miss';
  else {
    const label = labels[artistKey(f.id, raw.get(top.id) || top)] || 'unknown';
    kind = label === 'unknown' ? 'unlabelled' : label === 'different' || f.expect === 'none' ? 'WRONG' : 'hit';
  }
  return { id: f.id, kind, top: top ? `${top.artist} - ${top.title}` : null, calls: log.filter((e) => !e.probe).length, uncovered: log.filter((e) => e.uncovered).map((e) => e.q), altTitle: c.altTitle };
}

const tally = () => ({ hit: 0, abstain: 0, WRONG: 0, miss: 0, unlabelled: 0, calls: 0 });
const A = tally();
const B = tally();
const diffs = [];
const uncovered = [];
for (const snap of loadSnapshots()) {
  const a = await runOne(snap, false);
  const b = await runOne(snap, true);
  A[a.kind] += 1; A.calls += a.calls;
  B[b.kind] += 1; B.calls += b.calls;
  if (a.kind !== b.kind || a.top !== b.top) diffs.push(`  ${a.id}: A ${a.kind} (${a.top})  B ${b.kind} (${b.top})  altTitle ${JSON.stringify(b.altTitle)}`);
  for (const q of b.uncovered) uncovered.push(`  ${b.id} :: ${JSON.stringify(q)}`);
}
const line = (n, t) => `${n}  hit ${t.hit}  abstain ${t.abstain}  WRONG ${t.WRONG}  miss ${t.miss}  unlabelled ${t.unlabelled}  search calls ${t.calls}`;
console.log(line('A single title ', A));
console.log(line('B max(H0, H1)  ', B));
console.log(`\nfixtures whose result differs: ${diffs.length}`);
for (const d of diffs) console.log(d);
console.log(`\nB queries no capture answers (replayed as empty): ${uncovered.length}`);
for (const u of uncovered) console.log(u);
