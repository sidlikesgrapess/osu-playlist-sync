// DEV-ONLY (bench/): matching benchmark harness. Not imported by src/, not deployed.
/**
 * Stage 0 (artist probe) on top of Stage 1 + Stage 2.
 *
 * The probe flips the question. Instead of asking per candidate "does this artist string
 * look like mine?" — unbounded fuzzy matching — we ask osu! once per distinct artist
 * "what do you have by this name?", and read the answer off the corpus.
 *
 * Every beatmapset carries `artist` and `artist_unicode` as a paired observation, so the
 * corpus IS a (romanized, native) alias dictionary. Probing "Tuyu" yields sets whose
 * artist_unicode is ツユ, and ツユ is then a known alias — no hand-written table, and it
 * works for artists nobody anticipated.
 */
import { artistVerdict as baseVerdict, resolve as baseResolve } from './ladder.mjs';

export const name = 'ladder+lazyprobe';
export const probeMode = 'lazy';
export const usesProbe = true;
export const resolve = baseResolve;

const norm = s => (s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const romajiFold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]/gu, '')
  .replace(/shi/g, 'si').replace(/chi/g, 'ti').replace(/tsu/g, 'tu').replace(/ji/g, 'zi').replace(/fu/g, 'hu')
  .replace(/sh/g, 'sy').replace(/ch/g, 'ty').replace(/j/g, 'zy').replace(/ou/g, 'o').replace(/uu/g, 'u');

/**
 * Derive the alias set conservatively. A probe result only teaches us an alias if its own
 * artist field already links back to the target — otherwise a probe that returned loosely
 * related artists would poison the dictionary with genuine strangers.
 */
function aliasesFrom(probe, targetArtist) {
  const out = new Set();
  if (!probe) return out;
  const t = norm(targetArtist), tf = romajiFold(t);
  for (const set of probe.sets) {
    const a = norm(set.artist), au = norm(set.artist_unicode);
    const linked = a === t || au === t || (tf.length >= 4 && (romajiFold(a) === tf || romajiFold(au) === tf));
    if (!linked) continue;
    if (a) out.add(a);
    if (au) out.add(au);
  }
  return out;
}

const aliasCache = new Map();
function aliasesFor(probe, artist) {
  const key = `${probe ? probe.artist : ''}::${artist}`;
  if (!aliasCache.has(key)) aliasCache.set(key, aliasesFrom(probe, artist));
  return aliasCache.get(key);
}

/** Rung 2 of the ladder: an alias learned from the corpus, checked before fuzzy rungs. */
export function artistVerdict(set, tArtist, probe) {
  const direct = baseVerdict(set, tArtist);
  if (direct.verdict === 'SAME') return direct;

  const aliases = aliasesFor(probe, tArtist);
  if (aliases.size) {
    const a = norm(set.artist), au = norm(set.artist_unicode);
    if (aliases.has(a) || aliases.has(au)) return { verdict: 'SAME', confidence: 0.95, rung: 2 };
  }
  return direct;
}

function bigramDice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const g = s => { const r = []; for (let i = 0; i < s.length - 1; i++) r.push(s.slice(i, i + 2)); return r; };
  const A = g(a), B = g(b);
  if (!A.length || !B.length) return 0;
  const c = new Map();
  for (const x of A) c.set(x, (c.get(x) || 0) + 1);
  let o = 0;
  for (const x of B) { const n = c.get(x) || 0; if (n > 0) { o++; c.set(x, n - 1); } }
  return (2 * o) / (A.length + B.length);
}
const toks = s => s.split(' ').filter(Boolean);
function tokenContained(a, b) {
  const ta = new Set(toks(a)), tb = new Set(toks(b));
  if (!ta.size || !tb.size) return false;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) if (!large.has(t)) return false;
  return [...small].some(t => t.length >= 4) || a === b;
}
function titleSimilarity(set, tTitle) {
  const t = norm(tTitle);
  if (!t) return 0;
  let best = 0;
  for (const cand of [norm(set.title), norm(set.title_unicode)]) {
    if (!cand) continue;
    if (cand === t || tokenContained(t, cand)) return 1;
    const d = bigramDice(t, cand);
    const bar = Math.min(t.length, cand.length) < 6 ? 0.85 : 0.55;
    if (d >= bar && d > best) best = d;
  }
  return best;
}

export function score(set, title, artist, resolved = {}) {
  const tSim = titleSimilarity(set, title);
  if (tSim === 0) return -Infinity;

  const { verdict } = artistVerdict(set, artist, resolved.probe);

  // The decisive negative: the probe proved this artist has no maps on osu! at all, so a
  // title-only coincidence is never the right answer — refuse regardless of title score.
  const noPresence = resolved.probe && resolved.probe.sets.length === 0;
  if (noPresence && resolved.artistConfidence === 'high') return -Infinity;

  if (verdict === 'DIFFERENT' && resolved.artistConfidence === 'high') return -Infinity;

  let s = 160 * tSim - 60;
  if (verdict === 'SAME') s += 100;
  else if (verdict === 'WEAK') s += 30;
  else if (verdict === 'DIFFERENT') s -= 40;
  if (set.status === 'ranked' || set.status === 'loved') s += 15;
  return s;
}
