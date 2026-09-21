// DEV-ONLY (bench/): matching benchmark harness. Not imported by src/, not deployed.
/**
 * Build the artist gold standard by POOLING.
 *
 * Labelling all ~2200 captured candidates is not human-sized, and auto-labelling
 * `different` would fabricate the very verdicts the benchmark exists to measure.
 * So we label only what the scorers actually surface — pooled across every registered
 * scorer variant, which is the standard TREC pooling method. The scorers choose what
 * gets reviewed; a human chooses the verdict. Adding a new scorer re-pools, so the
 * gold standard never ends up biased toward whichever scorer wrote it first.
 *
 * Auto-labels exactly one case: byte-equal artist strings after normalization.
 *
 *   node bench/label.mjs          # refresh pool, list what needs a verdict
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { loadSnapshots, replay, artistKey } from './pool.mjs';

const ROOT = new URL('.', import.meta.url);
const LABELS = new URL('labels.json', ROOT);
const POOL_DEPTH = 8;

const norm = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

const scorers = [];
for (const f of readdirSync(new URL('scorers', ROOT)).filter(f => f.endsWith('.mjs'))) {
  scorers.push(await import(new URL(`scorers/${f}`, ROOT)));
}

const labels = existsSync(LABELS) ? JSON.parse(readFileSync(LABELS, 'utf8')) : {};
const todo = [];
let auto = 0, pooled = 0;

for (const snap of loadSnapshots()) {
  const fixArtist = snap.cleaned.artist || snap.fixture.channelTitle || '';
  const seen = new Set();

  for (const scorer of scorers) {
    const { pool } = replay(snap, scorer);
    for (const set of pool.slice(0, POOL_DEPTH)) {
      const key = artistKey(snap.fixture.id, set);
      if (seen.has(key)) continue;
      seen.add(key);
      pooled++;
      if (labels[key] && labels[key] !== 'unknown') continue;

      if (norm(set.artist) === norm(fixArtist) || norm(set.artist_unicode) === norm(fixArtist)) {
        labels[key] = 'same';
        auto++;
      } else {
        labels[key] = 'unknown';
        todo.push({ key, fixArtist, set });
      }
    }
  }
}

writeFileSync(LABELS, JSON.stringify(labels, null, 2));
const counts = Object.values(labels).reduce((a, v) => ((a[v] = (a[v] || 0) + 1), a), {});
console.log(`scorers: ${scorers.map(s => s.name).join(', ')} | pooled depth ${POOL_DEPTH}`);
console.log('labels.json:', counts, `(auto-labelled ${auto} this run)\n`);

if (todo.length) {
  console.log(`${todo.length} pairs need a verdict — same | different | cover:\n`);
  for (const t of todo) {
    const uni = t.set.artist_unicode && t.set.artist_unicode !== t.set.artist ? ` / ${t.set.artist_unicode}` : '';
    console.log(`  ${String(t.fixArtist).padEnd(22)} vs ${t.set.artist}${uni}`);
    console.log(`      "${t.set.title}"  ${t.key}`);
  }
}
