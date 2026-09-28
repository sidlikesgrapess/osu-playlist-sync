// One-off: answer check R's F-46 H1 queries from a live capture into test/fixtures/replay-supplement.json.
// Same { sets } shape and trim as bench/capture.mjs, server User-Agent. 1 token + N search calls, 1 s apart.
//   node --env-file=.env.local todo-run/f46/capture-supplement.mjs "<query>" ...
import { readFileSync, writeFileSync } from 'node:fs';
import { getOsuAccessToken } from '../../src/lib/osu.js';
import { UA_PROFILES } from '../../src/lib/http.js';

const FILE = new URL('../../test/fixtures/replay-supplement.json', import.meta.url);
const trim = (s) => ({ id: s.id, title: s.title, title_unicode: s.title_unicode, artist: s.artist, artist_unicode: s.artist_unicode, tags: s.tags, source: s.source, status: s.status, favourite_count: s.favourite_count, play_count: s.play_count });
const queries = process.argv.slice(2);
const token = await getOsuAccessToken();
if (!token) { console.error('no credentials'); process.exit(1); }
const doc = JSON.parse(readFileSync(FILE, 'utf8'));
for (const q of queries) {
  if (doc.byQuery[q]) { console.log(`skip (already present) ${q}`); continue; }
  const res = await fetch(`https://osu.ppy.sh/api/v2/beatmapsets/search?q=${encodeURIComponent(q)}&sort=relevance_desc&s=any`, {
    cache: 'no-store', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': UA_PROFILES.server },
  });
  if (!res.ok) { console.error(`${res.status} for ${q}`); process.exit(1); }
  const data = await res.json();
  doc.byQuery[q] = { sets: (data.beatmapsets || []).map(trim) };
  console.log(`${q}: ${doc.byQuery[q].sets.length} sets`);
  await new Promise((r) => setTimeout(r, 1000));
}
writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n');
