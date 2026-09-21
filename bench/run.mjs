// DEV-ONLY (bench/): matching benchmark harness. Not imported by src/, not deployed.
/**
 * Replay every fixture through every registered scorer and report metrics.
 * Offline and deterministic — reads snapshots, never the network.
 *
 *   node bench/run.mjs                 # all scorers at the default threshold
 *   node bench/run.mjs --threshold 70  # override
 *   node bench/run.mjs --detail        # per-fixture breakdown
 *   node bench/run.mjs --sweep         # threshold sweep
 */
import { readFileSync, readdirSync } from 'node:fs';
import { loadSnapshots, replay, artistKey } from './pool.mjs';

const ROOT = new URL('.', import.meta.url);
const labels = JSON.parse(readFileSync(new URL('labels.json', ROOT), 'utf8'));
const snapshots = loadSnapshots();

const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
};
const detail = process.argv.includes('--detail');
const sweep = process.argv.includes('--sweep');

const scorers = [];
for (const f of readdirSync(new URL('scorers', ROOT)).filter(f => f.endsWith('.mjs'))) {
  scorers.push(await import(new URL(`scorers/${f}`, ROOT)));
}

/**
 * Classify one fixture's outcome. `wrongArtist` is the metric that matters most:
 * the app returned a beatmap by an artist a human confirmed is NOT the target's.
 */
function classify(snap, scorer, minScore) {
  const { pool, accepted } = replay(snap, scorer, { minScore });
  const expect = snap.fixture.expect;
  const labelOf = set => labels[artistKey(snap.fixture.id, set)] || 'unknown';
  const sameExists = pool.some(s => labelOf(s) === 'same');

  if (accepted.length === 0) {
    if (expect === 'none' || expect === 'match-or-none') return { k: 'correctAbstain', top: null };
    return { k: sameExists ? 'miss' : 'unreachable', top: null };
  }

  const top = accepted[0];
  const label = labelOf(top);
  if (label === 'unknown') return { k: 'unlabelled', top };
  if (label === 'different') return { k: 'wrongArtist', top };
  if (expect === 'none') return { k: 'wrongArtist', top }; // matched something we said shouldn't exist
  return { k: 'hit', top };
}

const KINDS = ['hit', 'correctAbstain', 'wrongArtist', 'miss', 'unreachable', 'unlabelled'];

function evaluate(scorer, minScore) {
  const tally = Object.fromEntries(KINDS.map(k => [k, 0]));
  const rows = [];
  // Recall, tracked separately from top-1: how many human-confirmed correct mapsets does
  // this scorer make available at all? A map scored -Infinity is not merely ranked low,
  // it is invisible — it never reaches the user's alternatives list.
  let offered = 0, hardRejected = 0;
  for (const snap of snapshots) {
    const r = classify(snap, scorer, minScore);
    tally[r.k]++;
    rows.push({ id: snap.fixture.id, cls: snap.fixture.class, ...r });

    const { pool, accepted, title } = replay(snap, scorer, { minScore });
    // A "correct map" needs BOTH the confirmed artist AND the right song. Counting
    // artist alone would score a different track by the same artist as a correct map,
    // and would then read the gate's (correct) rejection of it as a loss.
    const nt = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
    const wanted = nt(title);
    const sameSong = set => {
      if (!wanted) return false;
      return [nt(set.title), nt(set.title_unicode)].some(c => c && (c === wanted || c.includes(wanted)));
    };
    const isCorrect = set => labels[artistKey(snap.fixture.id, set)] === 'same' && sameSong(set);
    offered += accepted.filter(isCorrect).length;
    hardRejected += pool.filter(s => isCorrect(s) && s._score === -Infinity).length;
  }
  return { tally, rows, offered, hardRejected };
}

if (sweep) {
  console.log('threshold sweep — wrongArtist is the metric to minimise\n');
  console.log('scorer'.padEnd(12), 'thr'.padStart(5), 'hit'.padStart(5), 'abst'.padStart(5), 'WRONG'.padStart(6), 'miss'.padStart(5), 'unre'.padStart(5));
  for (const scorer of scorers) {
    for (const t of [40, 55, 70, 85, 100, 120]) {
      const { tally } = evaluate(scorer, t);
      console.log(
        scorer.name.padEnd(12), String(t).padStart(5),
        String(tally.hit).padStart(5), String(tally.correctAbstain).padStart(5),
        String(tally.wrongArtist).padStart(6), String(tally.miss).padStart(5),
        String(tally.unreachable).padStart(5),
      );
    }
  }
  process.exit(0);
}

const minScore = arg('--threshold', 70);
console.log(`${snapshots.length} fixtures | threshold ${minScore} | labels: ${Object.keys(labels).length}\n`);

for (const scorer of scorers) {
  const r = evaluate(scorer, minScore);
  const { tally, rows } = r;
  const n = snapshots.length;
  const pct = x => `${((x / n) * 100).toFixed(1)}%`;
  console.log(`── ${scorer.name} ─────────────────────────────`);
  console.log(`  hit             ${String(tally.hit).padStart(3)}  ${pct(tally.hit)}   correct beatmap, artist confirmed`);
  console.log(`  correctAbstain  ${String(tally.correctAbstain).padStart(3)}  ${pct(tally.correctAbstain)}   returned nothing, and nothing was right`);
  console.log(`  WRONG ARTIST    ${String(tally.wrongArtist).padStart(3)}  ${pct(tally.wrongArtist)}   <- the failure that matters`);
  console.log(`  miss            ${String(tally.miss).padStart(3)}  ${pct(tally.miss)}   right answer was in the pool, we returned nothing`);
  console.log(`  unreachable     ${String(tally.unreachable).padStart(3)}  ${pct(tally.unreachable)}   right answer never came back from the API`);
  console.log(`  unlabelled      ${String(tally.unlabelled).padStart(3)}  ${pct(tally.unlabelled)}   needs a verdict in labels.json`);
  console.log(`  ---`);
  console.log(`  correct maps offered  ${String(r.offered).padStart(4)}   confirmed-artist mapsets the user can actually pick`);
  console.log(`  hard-rejected correct ${String(r.hardRejected).padStart(4)}   confirmed-artist mapsets made invisible by the gate`);

  if (detail) {
    console.log('');
    for (const r of rows.filter(r => r.k !== 'hit' && r.k !== 'correctAbstain')) {
      const t = r.top ? `${r.top.artist} — "${r.top.title}" (${r.top._score})` : '(nothing returned)';
      console.log(`    ${r.k.toUpperCase().padEnd(12)} ${r.id.padEnd(22)} ${t}`);
    }
  }
  console.log('');
}
