// DEV-ONLY (bench/): matching benchmark harness. Not imported by src/, not deployed.
/**
 * API-call cost model for the Stage 0 probe.
 *
 * Probes are memoized per distinct artist (the design's central cost claim), so a probe
 * is charged once no matter how many tracks share that artist. Title queries are charged
 * per track, as the production loop issues them.
 *
 *   node bench/cost.mjs
 */
import { readdirSync } from 'node:fs';
import { loadSnapshots, replay } from './pool.mjs';

const ROOT = new URL('.', import.meta.url);
const scorers = [];
for (const f of readdirSync(new URL('scorers', ROOT)).filter(f => f.endsWith('.mjs'))) {
  scorers.push(await import(new URL(`scorers/${f}`, ROOT)));
}
const snapshots = loadSnapshots();

console.log(`${snapshots.length} tracks, ${new Set(snapshots.map(s => s.fixture.channelTitle)).size} distinct artists`);
console.log(`(${(snapshots.length / new Set(snapshots.map(s => s.fixture.channelTitle)).size).toFixed(2)} tracks per artist)\n`);
console.log('scorer'.padEnd(20), 'title q'.padStart(8), 'probes'.padStart(7), 'total'.padStart(7), 'per track'.padStart(10));

for (const scorer of scorers) {
  let titleCalls = 0;
  const probedArtists = new Set();
  for (const snap of snapshots) {
    const r = replay(snap, scorer);
    const usedProbeBucket = r.probeUsed ? 1 : 0;
    titleCalls += (r.bucketsUsed ?? 0) - usedProbeBucket;
    if (r.probeUsed) probedArtists.add(r.artist);   // memoized: charged once per artist
  }
  const total = titleCalls + probedArtists.size;
  console.log(
    scorer.name.padEnd(20),
    String(titleCalls).padStart(8),
    String(probedArtists.size).padStart(7),
    String(total).padStart(7),
    (total / snapshots.length).toFixed(2).padStart(10),
  );
}
