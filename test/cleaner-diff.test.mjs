/**
 * A7: the cleaner diff.
 *
 * Runs the real `cleanSongTitle` over every bench fixture title and compares the result with
 * a committed snapshot (`test/fixtures/cleaner-snapshot.json`). `npm run bench` replays frozen
 * cleaned queries and never calls the cleaner, so this is the only gate that sees a cleaner
 * change at all.
 *
 * The options are the ones `extractors.js` passes: a structured source (Spotify, Apple) hands
 * its artist field over as `providerArtist`; YouTube and free-text queries pass none.
 *
 * Any change to the snapshot must be listed in the commit that makes it. To regenerate:
 *
 *   UPDATE_CLEANER_SNAPSHOT=1 node --test test/cleaner-diff.test.mjs
 *
 * The failure message prints every changed fixture as `id: field before -> after`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { cleanSongTitle } from '../src/lib/titleCleaner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = path.join(here, '..', 'bench', 'snapshots');
const SNAPSHOT_FILE = path.join(here, 'fixtures', 'cleaner-snapshot.json');

const STRUCTURED_SOURCES = new Set(['spotify', 'apple']);

/** The options object `extractors.js` builds for a song from this source. */
export function extractorOptions(fixture) {
  if (STRUCTURED_SOURCES.has(fixture.source)) {
    return { source: fixture.source, providerArtist: fixture.channelTitle || '' };
  }
  return { source: fixture.source };
}

function loadFixtures() {
  return readdirSync(SNAPSHOT_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(SNAPSHOT_DIR, f), 'utf8')).fixture);
}

function currentOutput() {
  const out = {};
  for (const fixture of loadFixtures()) {
    const r = cleanSongTitle(fixture.rawTitle, fixture.channelTitle || '', extractorOptions(fixture));
    out[fixture.id] = {
      input: { rawTitle: fixture.rawTitle, channelTitle: fixture.channelTitle || '', source: fixture.source },
      output: { title: r.title, artist: r.artist, cleanQuery: r.cleanQuery, queries: r.queries },
    };
  }
  return out;
}

const show = (v) => JSON.stringify(v);

function diffLines(before, after) {
  const lines = [];
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const id of [...ids].sort()) {
    const b = before[id]?.output;
    const a = after[id]?.output;
    if (!b) { lines.push(`${id}: (new fixture) -> ${show(a)}`); continue; }
    if (!a) { lines.push(`${id}: ${show(b)} -> (fixture removed)`); continue; }
    for (const field of ['title', 'artist', 'cleanQuery', 'queries']) {
      if (show(b[field]) !== show(a[field])) {
        lines.push(`${id}: ${field} ${show(b[field])} -> ${show(a[field])}`);
      }
    }
  }
  return lines;
}

test('cleanSongTitle output over every bench fixture matches the committed snapshot', () => {
  const after = currentOutput();

  if (process.env.UPDATE_CLEANER_SNAPSHOT) {
    let before = {};
    try {
      before = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')).fixtures;
    } catch {
      // first write
    }
    const lines = diffLines(before, after);
    const body = {
      note: 'A7 cleaner diff snapshot. Regenerate with UPDATE_CLEANER_SNAPSHOT=1 and list every change in the commit.',
      fixtures: after,
    };
    writeFileSync(SNAPSHOT_FILE, `${JSON.stringify(body, null, 2)}\n`);
    console.log(lines.length ? lines.join('\n') : 'cleaner snapshot unchanged');
    return;
  }

  const before = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')).fixtures;
  const lines = diffLines(before, after);
  assert.equal(lines.length, 0, `cleaner output changed:\n${lines.join('\n')}`);
});

test('every bench fixture is covered by the snapshot', () => {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')).fixtures;
  const ids = loadFixtures().map((f) => f.id);
  assert.ok(ids.length > 0, 'no bench fixtures found');
  for (const id of ids) assert.ok(snapshot[id], `fixture ${id} missing from the snapshot`);
});
