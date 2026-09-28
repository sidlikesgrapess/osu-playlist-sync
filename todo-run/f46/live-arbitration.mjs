// F-46 fix round 1: do the three trailing round tags the H0 reading drops (#40, #41, #45)
// come back through search time arbitration? Calls /api/osu/search on the running dev
// server with exactly the fields page.js sends (buildSearchRequest), 3 titles, 2 s apart.
//   node todo-run/f46/live-arbitration.mjs
import { cleanSongTitle } from '../../src/lib/titleCleaner.js';
import { buildSearchRequest } from '../../src/lib/searchRequest.js';

const CASES = [
  ['COOL&CREATE - Night of Nights (Flowering nights remix)', 'COOL&CREATE'],
  ['Hanasaka Yui - Harumachi Clover (Swing Arrangement)', 'osu! music'],
  ['Disturbed - The Sound Of Silence (CYRIL Remix)', 'Disturbed'],
];
for (const [raw, channel] of CASES) {
  const c = cleanSongTitle(raw, channel, { source: 'youtube' });
  const song = { title: raw, channelTitle: channel, source: 'youtube', cleanQuery: c.cleanQuery, extractedTitle: c.title,
    extractedArtist: c.artist, altTitle: c.altTitle, artistFromTitle: c.artistFromTitle, fallbacks: c.fallbacks, queries: c.queries };
  const params = buildSearchRequest(song, { status: 'any', strictness: 50 });
  const res = await fetch(`http://localhost:3000/api/osu/search?${params}`);
  const body = await res.json();
  const top = (body.beatmapsets || [])[0];
  console.log(JSON.stringify({ raw, h0: c.title, h1: c.altTitle, status: res.status, bestScore: body.bestScore,
    top: top ? `${top.artist} - ${top.title} (#${top.id}, score ${top.matchScore})` : null,
    next: (body.beatmapsets || []).slice(1, 3).map((s) => `${s.artist} - ${s.title} (${s.matchScore})`) }));
  await new Promise((r) => setTimeout(r, 2000));
}
