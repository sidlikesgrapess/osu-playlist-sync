// DEV-ONLY (bench/): matching benchmark harness. Not imported by src/, not deployed.
/**
 * Stage 0 capture: one artist probe per DISTINCT artist across all fixtures.
 *
 * Verified live before building on it: osu!'s search accepts an `artist=` field operator,
 * and it is meaningfully purer than a bare text query (`artist=Tuyu` returns 50/50 Tuyu;
 * bare `Tuyu` mixes in an unrelated artist).
 *
 * The probe pays for itself twice:
 *   1. Alias discovery — every beatmapset is a free (romanized, native) labelled pair,
 *      so the corpus IS the alias dictionary. No hand-written table.
 *   2. Retrieval — the returned sets join the candidate pool, reaching maps the
 *      title-driven queries never asked for.
 *
 *   node --env-file=.env.local bench/capture-probes.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { getOsuAccessToken } from '../src/lib/osu.js';
import { cleanSongTitle } from '../src/lib/titleCleaner.js';

const ROOT = new URL('.', import.meta.url);
const fixtures = JSON.parse(readFileSync(new URL('fixtures.json', ROOT), 'utf8'));

export const slug = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'empty';

const trim = s => ({
  id: s.id, title: s.title, title_unicode: s.title_unicode,
  artist: s.artist, artist_unicode: s.artist_unicode,
  tags: s.tags, source: s.source, status: s.status,
  favourite_count: s.favourite_count, play_count: s.play_count,
});

const token = await getOsuAccessToken();
if (!token) { console.error('No credentials — run with --env-file=.env.local'); process.exit(1); }

// Capture the artist string each scorer will actually look up. That is NOT one string per
// fixture: a structured source resolves to `channelTitle` (Spotify hands us a real artist
// field, so the `Artist - Title` splitter has nothing to add), while everything else
// resolves to the cleaned artist. Capture both and let the lookup pick.
//
// Capturing only the raw channel title was the original bug: a YouTube auto-generated
// channel is "nihmune - Topic", and `artist=nihmune - Topic` returns 0 sets while
// `artist=nihmune` returns 37 -- so the replay disagreed with production on exactly the
// fixtures that exist to test low-confidence artists.
//
// One probe per distinct artist, not per track: this is the whole cost argument.
const artists = [...new Set(fixtures.flatMap(f => [
  f.channelTitle,
  cleanSongTitle(f.rawTitle, f.channelTitle).artist,
]).filter(Boolean))];
console.log(`${fixtures.length} fixtures -> ${artists.length} distinct artists to probe\n`);

for (const artist of artists) {
  const q = `artist=${artist}`;
  const res = await fetch(
    `https://osu.ppy.sh/api/v2/beatmapsets/search?q=${encodeURIComponent(q)}&sort=relevance_desc&s=any`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );
  if (!res.ok) {
    console.warn(`  ! ${res.status} probing "${artist}"`);
    await new Promise(r => setTimeout(r, res.status === 429 ? 5000 : 400));
    continue;
  }
  const sets = (await res.json()).beatmapsets || [];
  writeFileSync(
    new URL(`probes/${slug(artist)}.json`, ROOT),
    JSON.stringify({ artist, query: q, capturedAt: new Date().toISOString(), sets: sets.map(trim) }, null, 2)
  );
  const distinct = new Set(sets.map(s => s.artist));
  console.log(`${artist.padEnd(28)} ${String(sets.length).padStart(3)} sets, ${distinct.size} distinct artist spellings`);
  await new Promise(r => setTimeout(r, 250));
}
console.log('\nProbes captured.');
