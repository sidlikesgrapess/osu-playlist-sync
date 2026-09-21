// DEV-ONLY (bench/): matching benchmark harness. Not imported by src/, not deployed.
/**
 * Capture real osu! API responses for every benchmark fixture, once, to disk.
 *
 * The benchmark itself must be deterministic and offline: if it re-queried the API
 * on every run, a scorer change and an osu!-side ranking change would be
 * indistinguishable, and rate limits would make it unrunnable in a loop.
 *
 *   node --env-file=.env.local bench/capture.mjs [--only <fixture-id>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { getOsuAccessToken } from '../src/lib/osu.js';
import { cleanSongTitle } from '../src/lib/titleCleaner.js';

const ROOT = new URL('.', import.meta.url);
const fixtures = JSON.parse(readFileSync(new URL('fixtures.json', ROOT), 'utf8'));

const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null;

/** Keep only the fields the scorer can actually read — snapshots stay small and reviewable. */
function trim(set) {
  return {
    id: set.id,
    title: set.title,
    title_unicode: set.title_unicode,
    artist: set.artist,
    artist_unicode: set.artist_unicode,
    tags: set.tags,
    source: set.source,
    status: set.status,
    favourite_count: set.favourite_count,
    play_count: set.play_count,
  };
}

/**
 * Mirrors the query list `searchOsuBeatmaps` builds, but captures *every* variant
 * unconditionally — no early exit. That lets the replay simulate different query
 * strategies (e.g. MATCHING_PLAN Phase 3) against one capture.
 */
function queryVariantsFor(fixture) {
  const cleaned = cleanSongTitle(fixture.rawTitle, fixture.channelTitle);
  const title = cleaned.title || fixture.rawTitle;
  const artist = cleaned.artist || fixture.channelTitle || '';
  return {
    cleaned: { title, artist, cleanQuery: cleaned.cleanQuery, queries: cleaned.queries },
    variants: Array.from(new Set([
      artist && title ? `${artist} ${title}`.trim() : null,
      cleaned.cleanQuery,
      ...(cleaned.queries || []),
      title,
    ].filter(Boolean))),
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const token = await getOsuAccessToken();
if (!token) {
  console.error('No osu! credentials. Run with: node --env-file=.env.local bench/capture.mjs');
  process.exit(1);
}

const targets = only ? fixtures.filter(f => f.id === only) : fixtures;
let calls = 0;

for (const fixture of targets) {
  const { cleaned, variants } = queryVariantsFor(fixture);
  const byQuery = {};

  for (const q of variants) {
    const path = `/beatmapsets/search?q=${encodeURIComponent(q)}&sort=relevance_desc&s=any`;
    const res = await fetch(`https://osu.ppy.sh/api/v2${path}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    calls++;

    if (!res.ok) {
      console.warn(`  ! ${res.status} for "${q}"`);
      byQuery[q] = { error: res.status, sets: [] };
      await sleep(res.status === 429 ? 5000 : 400);
      continue;
    }

    const data = await res.json();
    byQuery[q] = { sets: (data.beatmapsets || []).map(trim) };
    await sleep(250); // stay well clear of the rate limiter
  }

  const pool = new Map();
  for (const { sets = [] } of Object.values(byQuery)) {
    for (const s of sets) if (!pool.has(s.id)) pool.set(s.id, s);
  }

  writeFileSync(
    new URL(`snapshots/${fixture.id}.json`, ROOT),
    JSON.stringify({ fixture, cleaned, capturedAt: new Date().toISOString(), byQuery }, null, 2)
  );
  console.log(`${fixture.id.padEnd(24)} ${variants.length} queries -> ${pool.size} distinct sets`);
}

console.log(`\nDone. ${targets.length} fixtures, ${calls} API calls.`);
