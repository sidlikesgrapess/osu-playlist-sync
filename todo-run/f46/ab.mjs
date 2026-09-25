#!/usr/bin/env node
/**
 * F-46 A/B harness over the held-out labelled title set (corpus.json).
 *
 *   node todo-run/f46/ab.mjs [cleanerModule] [--json out.json]
 *   node todo-run/f46/ab.mjs --compare a.json b.json
 *
 * cleanerModule defaults to src/lib/titleCleaner.js (resolved relative to this script); a path
 * given on the command line is resolved relative to the current directory.
 *
 * cleanSongTitle is called exactly as src/lib/extractors.js calls it:
 *   cleanSongTitle(title, channelTitle, { source, providerArtist? })
 * where providerArtist is passed only for the structured sources (spotify, apple) and is the
 * provider's artist field (extractors.js puts that field in channelTitle). If the module also
 * exports a function named `cleanPlaylistTitles`, the options gain `playlistTitles`: the raw
 * titles of every corpus entry sharing this entry's `playlist` id (or just this title when the
 * entry has none), so a playlist-level signal can be tested. Nothing here makes a network call.
 *
 * Scoring. A title is correct when normalize(got.title) equals normalize(expectTitle) or any
 * of expectTitleAlt. normalize = NFKC, lowercase, collapse whitespace, strip leading and
 * trailing punctuation/symbols. The artist is scored only where expectArtist is non-null, with
 * a trailing feat./ft./featuring/with/w/ credit removed from both sides first.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const STRUCTURED = new Set(['spotify', 'apple']);

export function normalizeTitle(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '');
}

const FEAT_TAIL = /\s*[([]?\s*(?:feat\.?|ft\.?|featuring|with|w\/)\s.*$/i;
export function normalizeArtist(value) {
  return normalizeTitle(String(value ?? '').replace(FEAT_TAIL, ''));
}

function loadCorpus() {
  const data = JSON.parse(readFileSync(path.join(here, 'corpus.json'), 'utf8'));
  return data.entries.map((entry, i) => ({ id: i + 1, ...entry }));
}

async function run(modulePath) {
  const mod = await import(pathToFileURL(modulePath).href);
  if (typeof mod.cleanSongTitle !== 'function') throw new Error(`${modulePath} exports no cleanSongTitle`);
  const playlistAware = typeof mod.cleanPlaylistTitles === 'function';
  const corpus = loadCorpus();

  const groups = new Map();
  for (const e of corpus) {
    if (!e.playlist) continue;
    if (!groups.has(e.playlist)) groups.set(e.playlist, []);
    groups.get(e.playlist).push(e.raw);
  }

  const rows = corpus.map((e) => {
    const structured = STRUCTURED.has(e.source);
    const channelTitle = structured ? (e.artist ?? e.channel ?? '') : (e.channel ?? '');
    const options = { source: e.source, ...(structured ? { providerArtist: e.artist || channelTitle || '' } : {}) };
    if (playlistAware) options.playlistTitles = e.playlist ? groups.get(e.playlist) : [e.raw];

    let got;
    try {
      got = mod.cleanSongTitle(e.raw, channelTitle, options);
    } catch (err) {
      got = { title: `<threw ${err.message}>`, artist: '' };
    }
    const accepted = [e.expectTitle, ...(e.expectTitleAlt || [])].map(normalizeTitle);
    const titleOk = accepted.includes(normalizeTitle(got.title));
    const artistScored = e.expectArtist != null;
    const artistOk = artistScored ? normalizeArtist(got.artist) === normalizeArtist(e.expectArtist) : null;
    return {
      id: e.id, cat: e.cat, playlist: e.playlist || null, raw: e.raw,
      expectTitle: e.expectTitle, expectArtist: e.expectArtist ?? null,
      gotTitle: got.title ?? '', gotArtist: got.artist ?? '', cleanQuery: got.cleanQuery ?? '',
      titleOk, artistOk,
    };
  });

  const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
  const summarize = (list) => {
    const scored = list.filter((r) => r.artistOk !== null);
    return {
      n: list.length,
      titleOk: list.filter((r) => r.titleOk).length,
      artistN: scored.length,
      artistOk: scored.filter((r) => r.artistOk).length,
    };
  };
  const cats = [...new Set(rows.map((r) => r.cat))];
  const byCat = Object.fromEntries(cats.map((c) => [c, summarize(rows.filter((r) => r.cat === c))]));
  const total = summarize(rows);

  const lines = [];
  lines.push(`cleaner: ${path.relative(process.cwd(), modulePath)}${playlistAware ? ' (playlist-aware)' : ''}`);
  lines.push(`entries: ${total.n}`);
  lines.push(`title  accuracy: ${total.titleOk}/${total.n} = ${pct(total.titleOk, total.n)}`);
  lines.push(`artist accuracy: ${total.artistOk}/${total.artistN} = ${pct(total.artistOk, total.artistN)}`);
  lines.push('');
  lines.push('category        n   title          artist');
  for (const c of cats) {
    const s = byCat[c];
    lines.push(
      `${c.padEnd(14)} ${String(s.n).padStart(3)}   ${`${s.titleOk}/${s.n}`.padEnd(6)} ${pct(s.titleOk, s.n).padStart(6)}   ${`${s.artistOk}/${s.artistN}`.padEnd(6)} ${pct(s.artistOk, s.artistN).padStart(6)}`
    );
  }
  lines.push('');
  lines.push('misses:');
  for (const r of rows) {
    if (r.titleOk && r.artistOk !== false) continue;
    const what = [!r.titleOk && 'TITLE', r.artistOk === false && 'ARTIST'].filter(Boolean).join('+');
    lines.push(`  #${r.id} [${r.cat}] ${what}  ${r.raw}`);
    if (!r.titleOk) lines.push(`      title  want ${JSON.stringify(r.expectTitle)}  got ${JSON.stringify(r.gotTitle)}`);
    if (r.artistOk === false) lines.push(`      artist want ${JSON.stringify(r.expectArtist)}  got ${JSON.stringify(r.gotArtist)}`);
  }
  return { report: lines.join('\n'), result: { module: path.relative(process.cwd(), modulePath).split(path.sep).join('/'), playlistAware, total, byCat, rows } };
}

function compare(aFile, bFile) {
  const a = JSON.parse(readFileSync(aFile, 'utf8'));
  const b = JSON.parse(readFileSync(bFile, 'utf8'));
  const bById = new Map(b.rows.map((r) => [r.id, r]));
  const out = { fixed: [], broken: [], bothWrong: [], changedOutput: [] };
  for (const ra of a.rows) {
    const rb = bById.get(ra.id);
    if (!rb) continue;
    const okA = ra.titleOk && ra.artistOk !== false;
    const okB = rb.titleOk && rb.artistOk !== false;
    const entry = `#${ra.id} [${ra.cat}] ${ra.raw}\n      A: ${JSON.stringify(ra.gotTitle)} / ${JSON.stringify(ra.gotArtist)}\n      B: ${JSON.stringify(rb.gotTitle)} / ${JSON.stringify(rb.gotArtist)}\n      want ${JSON.stringify(ra.expectTitle)} / ${JSON.stringify(ra.expectArtist)}`;
    if (!okA && okB) out.fixed.push(entry);
    else if (okA && !okB) out.broken.push(entry);
    else if (!okA && !okB) out.bothWrong.push(entry);
    else if (ra.gotTitle !== rb.gotTitle || ra.gotArtist !== rb.gotArtist) out.changedOutput.push(entry);
  }
  const lines = [
    `A: ${a.module}  title ${a.total.titleOk}/${a.total.n}  artist ${a.total.artistOk}/${a.total.artistN}`,
    `B: ${b.module}  title ${b.total.titleOk}/${b.total.n}  artist ${b.total.artistOk}/${b.total.artistN}`,
    '',
  ];
  for (const [label, list] of [['fixed (A wrong, B right)', out.fixed], ['broken (A right, B wrong)', out.broken], ['both wrong', out.bothWrong], ['both right, output differs', out.changedOutput]]) {
    lines.push(`${label}: ${list.length}`);
    for (const e of list) lines.push(`  ${e}`);
    lines.push('');
  }
  return lines.join('\n');
}

const args = process.argv.slice(2);
if (args[0] === '--compare') {
  if (args.length < 3) { console.error('usage: ab.mjs --compare a.json b.json'); process.exit(2); }
  console.log(compare(args[1], args[2]));
} else {
  const jsonAt = args.indexOf('--json');
  const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
  const positional = args.filter((a, i) => a !== '--json' && (jsonAt < 0 || i !== jsonAt + 1));
  const modulePath = positional[0]
    ? path.resolve(process.cwd(), positional[0])
    : path.resolve(here, '../../src/lib/titleCleaner.js');
  const { report, result } = await run(modulePath);
  console.log(report);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(result, null, 2) + '\n');
}
