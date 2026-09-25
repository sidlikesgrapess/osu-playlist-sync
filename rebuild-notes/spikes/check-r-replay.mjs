// Session 1 spike behind plan check R (REBUILD_PLAN.md section 3). Not a test; Session 2 turns it
// into test/search-replay.test.mjs.
//   node rebuild-notes/spikes/check-r-replay.mjs "<repo>" app   -> params page.js sends today (hit 30, 58 calls)
//   node rebuild-notes/spikes/check-r-replay.mjs "<repo>" bench -> hybrid: F-28 scoring inputs, OLD cleaner queries (hit 31, 56 calls; not F-28, see plan Status)
// Optional 3rd arg prints per-fixture call counts. Snapshots do not store `fallbacks`; that is
// harmless because titleCleaner returns fallbacks = queries.slice(1), and page.js and osu.js both
// dedupe through a Set, so the query order the real loop sees is identical.
process.env.OSU_CLIENT_ID = 'stub'; process.env.OSU_CLIENT_SECRET = 'stub';
const REPO = process.argv[2]; const APP = process.argv[3] === 'app';
const { readFileSync } = await import('node:fs');
const { pathToFileURL } = await import('node:url');
const U = p => pathToFileURL(`${REPO}/${p}`).href;
const { loadSnapshots, artistKey } = await import(U('bench/pool.mjs'));
const { slug } = { slug: s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'empty' };
const labels = JSON.parse(readFileSync(`${REPO}/bench/labels.json`, 'utf8'));

let current = null, calls = 0, probeCalls = 0;
const misses = [];
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.pathname.endsWith('/oauth/token')) return json({ access_token: 'stub', expires_in: 86400 });
  calls++;
  const q = u.searchParams.get('q');
  if (q.startsWith('artist=')) {
    probeCalls++;
    try { return json({ beatmapsets: JSON.parse(readFileSync(`${REPO}/bench/probes/${slug(q.slice(7))}.json`, 'utf8')).sets }); }
    catch { misses.push([current.fixture.id, 'PROBE', q]); return json({ beatmapsets: [] }); }
  }
  const b = current.byQuery[q];
  if (!b) { misses.push([current.fixture.id, 'QUERY', q]); return json({ beatmapsets: [] }); }
  return json({ beatmapsets: b.sets });
};

const { searchOsuBeatmaps } = await import(U('src/lib/osu.js'));
const tally = {}; const rows = [];
for (const snap of loadSnapshots()) {
  current = snap; const c0 = calls, p0 = probeCalls;
  const f = snap.fixture, c = snap.cleaned;
  const structured = f.source === 'spotify' || f.source === 'apple';
  const title = APP ? (c.title || f.rawTitle) : (structured ? f.rawTitle : c.title);
  const artist = APP ? (c.artist || f.channelTitle || '') : (structured ? f.channelTitle : (c.artist || f.channelTitle || ''));
  let r;
  try {
    r = await searchOsuBeatmaps(c.cleanQuery || title, { title, artist, queries: c.queries || [], status: 'any', source: f.source, strictness: 50 });
  } catch (e) { rows.push([f.id, 'THREW', e.message]); tally.threw = (tally.threw || 0) + 1; continue; }
  const accepted = (r.beatmapsets || []).filter(s => !s.artistOverride && !s.titleOnly);
  const raw = new Map(); for (const b of Object.values(snap.byQuery)) for (const s of b.sets || []) raw.set(s.id, s);
  try { for (const s of JSON.parse(readFileSync(`${REPO}/bench/probes/${slug(artist)}.json`, "utf8")).sets) raw.set(s.id, s); } catch {}
  const labelOf = s => labels[artistKey(f.id, raw.get(s.id) || s)] || "unknown";
  let k;
  if (!accepted.length) k = (f.expect === 'none' || f.expect === 'match-or-none') ? 'correctAbstain' : 'missOrUnreachable';
  else { const l = labelOf(accepted[0]); k = l === 'unknown' ? 'unlabelled' : l === 'different' || f.expect === 'none' ? 'wrongArtist' : 'hit'; }
  tally[k] = (tally[k] || 0) + 1; if (process.argv[4]) console.log('PER', f.id, f.source, calls - c0, probeCalls - p0);
  if (k !== 'hit' && k !== 'correctAbstain') rows.push([f.id, k, accepted[0] ? `${accepted[0].artist} - ${accepted[0].title}` : `rejection=${r.rejection?.kind}`]);
}
console.log('tally', tally);
console.log('calls', calls, 'probes', probeCalls, 'per track', (calls / loadSnapshots().length).toFixed(2));
console.log('coverage misses', misses.length); for (const m of misses) console.log('  ', ...m);
for (const r of rows) console.log('  ', ...r);
