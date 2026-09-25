import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  selectedBeatmapEntries,
  selectedBeatmaps,
  matchedBeatmapUnion,
  soleOwnerSides,
  zipBaseTitle,
  DEFAULT_ZIP_TITLE,
} from '../src/lib/selection.js';

const row = (id, setId) => ({ id, matchedBeatmap: setId == null ? null : { id: setId } });

const playlistSongs = [row('yt_a', 1), row('yt_b', 2), row('yt_c', 3), row('yt_d', null)];
const playerSongs = [row('osu_2', 2), row('osu_4', 4), row('osu_5', 5)];

const sides = (playlistIds, playerIds) => [
  { name: 'playlist', songs: playlistSongs, selectedIds: new Set(playlistIds) },
  { name: 'player', songs: playerSongs, selectedIds: new Set(playerIds) },
];

test('the union takes ticked rows from both sides, playlist first', () => {
  const out = selectedBeatmaps(sides(['yt_a', 'yt_c'], ['osu_4']));
  assert.deepEqual(out.map(s => s.id), ['yt_a', 'yt_c', 'osu_4']);
});

test('a beatmapset ticked on both sides counts once and keeps the playlist row', () => {
  // N = 2 playlist ticks, M = 2 player ticks, K = 1 shared set: N + M - K = 3.
  const entries = selectedBeatmapEntries(sides(['yt_a', 'yt_b'], ['osu_2', 'osu_5']));
  assert.equal(entries.length, 3);
  const shared = entries.find(e => e.song.matchedBeatmap.id === 2);
  assert.equal(shared.song.id, 'yt_b');
  assert.deepEqual([...shared.sides].sort(), ['player', 'playlist']);
});

test('unticked and unmatched rows are left out', () => {
  const out = selectedBeatmaps(sides(['yt_d'], []));
  assert.deepEqual(out, []);
  assert.deepEqual(selectedBeatmaps(sides(['yt_a'], [])).map(s => s.id), ['yt_a']);
});

test('an empty side works, and so does a side with no list yet', () => {
  assert.deepEqual(selectedBeatmaps(sides([], ['osu_4'])).map(s => s.id), ['osu_4']);
  assert.deepEqual(selectedBeatmaps([
    { name: 'playlist', songs: undefined, selectedIds: new Set(['x']) },
    { name: 'player', songs: [], selectedIds: new Set() },
  ]), []);
});

test('a tick whose row is gone from its side does not count', () => {
  // A player tick never counts against the playlist list, and the other way round.
  assert.deepEqual(selectedBeatmaps(sides(['osu_4'], ['yt_a'])), []);
});

test('two playlist rows matched to one set download it once', () => {
  const out = selectedBeatmaps([
    { name: 'playlist', songs: [row('a', 9), row('b', 9)], selectedIds: new Set(['a', 'b']) },
  ]);
  assert.deepEqual(out.map(s => s.id), ['a']);
});

test('matchedBeatmapUnion dedupes matched rows across lists and skips unmatched ones', () => {
  const out = matchedBeatmapUnion([playlistSongs, playerSongs]);
  assert.deepEqual(out.map(s => s.id), ['yt_a', 'yt_b', 'yt_c', 'osu_4', 'osu_5']);
  assert.deepEqual(matchedBeatmapUnion([[], undefined]), []);
});

test('soleOwnerSides names only a side that holds a set nobody else ticked', () => {
  assert.deepEqual([...soleOwnerSides(selectedBeatmapEntries(sides(['yt_b'], ['osu_2'])))], []);
  assert.deepEqual([...soleOwnerSides(selectedBeatmapEntries(sides(['yt_a', 'yt_b'], ['osu_2'])))], ['playlist']);
  assert.deepEqual(
    [...soleOwnerSides(selectedBeatmapEntries(sides(['yt_a'], ['osu_4'])))].sort(),
    ['player', 'playlist'],
  );
});

test('zipBaseTitle names the batch after the only side it came from', () => {
  const names = { playerName: 'mrekk', playlistTitle: 'Bangers' };
  assert.equal(zipBaseTitle(selectedBeatmapEntries(sides([], ['osu_4'])), names), 'mrekk_osu_maps');
  assert.equal(zipBaseTitle(selectedBeatmapEntries(sides(['yt_a'], [])), names), 'Bangers');
  assert.equal(zipBaseTitle(selectedBeatmapEntries(sides(['yt_a'], ['osu_4'])), names), DEFAULT_ZIP_TITLE);
  assert.equal(zipBaseTitle(selectedBeatmapEntries(sides(['yt_a'], [])), {}), DEFAULT_ZIP_TITLE);
  assert.equal(zipBaseTitle([], names), DEFAULT_ZIP_TITLE);
});
