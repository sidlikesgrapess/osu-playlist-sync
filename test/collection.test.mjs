import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  beatmapsetKey, matchesCollectionFilters, dedupeByBeatmapset, visibleItemsFor, beatmapToSong,
} from '../src/lib/collection.js';

const diff = (id, mode, stars) => ({ id, mode, difficultyRating: stars });
const entry = (setId, status, diffs, meta = {}) => ({
  beatmapset: {
    id: setId, artist: `Artist ${setId}`, title: `Title ${setId}`, creator: 'mapper', status,
    covers: { list: `list-${setId}.jpg` }, difficulties: diffs,
    starRange: { min: diffs[0].difficultyRating, max: diffs[diffs.length - 1].difficultyRating },
  },
  meta,
});

test('beatmapsetKey is the set id, the key both dedupes share (F-41)', () => {
  assert.equal(beatmapsetKey({ id: 42, title: 'x' }), 42);
});

test('matchesCollectionFilters: ranked means Ranked & Loved, and mode reads the difficulties', () => {
  const loved = entry(1, 'loved', [diff(10, 'osu', 3)]).beatmapset;
  const graveyard = entry(2, 'graveyard', [diff(20, 'taiko', 3)]).beatmapset;
  assert.equal(matchesCollectionFilters(loved, 'all', 'ranked'), true);
  assert.equal(matchesCollectionFilters(graveyard, 'all', 'ranked'), false);
  assert.equal(matchesCollectionFilters(graveyard, 'taiko', 'any'), true);
  assert.equal(matchesCollectionFilters(graveyard, 'osu', 'any'), false);
});

test('dedupeByBeatmapset keeps the higher pp row, merges difficulties and sums playcounts', () => {
  const [merged] = dedupeByBeatmapset([
    entry(1, 'ranked', [diff(11, 'osu', 5)], { pp: 100, playCount: 3 }),
    entry(1, 'ranked', [diff(10, 'osu', 2)], { pp: 250, playCount: 4 }),
  ]);
  assert.equal(merged.meta.pp, 250);
  assert.equal(merged.meta.playCount, 7);
  assert.deepEqual(merged.beatmapset.difficulties.map(d => d.id), [10, 11]);
  assert.deepEqual(merged.beatmapset.starRange, { min: 2, max: 5 });
});

test('visibleItemsFor filters before it dedupes, so a merged row never smuggles in another mode', () => {
  // Two entries for one set: the player's taiko score and their osu! score.
  const entries = [
    entry(1, 'ranked', [diff(10, 'taiko', 4)], { pp: 300 }),
    entry(1, 'ranked', [diff(11, 'osu', 5)], { pp: 200 }),
    entry(2, 'graveyard', [diff(20, 'osu', 3)], { pp: 100 }),
  ];
  const osu = visibleItemsFor('best', entries, 'osu', 'any');
  assert.deepEqual(osu.map(s => s.id), ['osu_1', 'osu_2']);
  // Filtered first: only the osu! difficulty, and its own score, survive for set 1.
  assert.deepEqual(osu[0].matchedBeatmap.difficulties.map(d => d.id), [11]);
  assert.equal(osu[0].playerMeta.pp, 200);

  const all = visibleItemsFor('best', entries, 'all', 'any');
  assert.equal(all.length, 2);
  assert.deepEqual(all[0].matchedBeatmap.difficulties.map(d => d.id), [10, 11]);

  assert.deepEqual(visibleItemsFor('best', entries, 'all', 'ranked').map(s => s.id), ['osu_1']);
  assert.deepEqual(visibleItemsFor('best', undefined, 'all', 'any'), []);
});

test('beatmapToSong builds a pre-matched osu-player song through makeSong (F-32)', () => {
  const e = entry(7, 'ranked', [diff(70, 'osu', 4)], { playCount: 12 });
  const song = beatmapToSong(e, 'most_played');
  assert.equal(song.source, 'osu-player');
  assert.equal(song.id, 'osu_7');
  assert.equal(song.extractedArtist, 'Artist 7');
  assert.equal(song.extractedTitle, 'Title 7');
  assert.equal(song.title, 'Artist 7 - Title 7');
  assert.equal(song.channelTitle, 'mapped by mapper');
  assert.equal(song.thumbnail, 'list-7.jpg');
  assert.equal(song.hasSearched, true);
  assert.equal(song.matchedBeatmap, e.beatmapset);
  assert.deepEqual(song.allMatches, [e.beatmapset]);
  assert.deepEqual(song.playerMeta, { playCount: 12 });
  assert.equal(song.playerSection, 'most_played');
  // makeSong's rest state is there too.
  assert.equal(song.isSearching, false);
  assert.deepEqual(song.fallbacks, []);
});
