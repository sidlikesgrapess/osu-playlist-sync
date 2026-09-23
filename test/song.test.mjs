import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeSong, songKey, mergeSongs } from '../src/lib/song.js';

test('makeSong requires a valid source and rejects anything else', () => {
  assert.throws(() => makeSong({ title: 'no source' }), /source/);
  assert.throws(() => makeSong({ source: 'bogus', title: 'x' }), /source/);
  for (const source of ['spotify', 'apple', 'youtube', 'query', 'osu-player']) {
    assert.doesNotThrow(() => makeSong({ source }));
  }
});

test('makeSong fills the song contract defaults', () => {
  const song = makeSong({ source: 'query' });
  assert.equal(song.source, 'query');
  assert.equal(song.hasSearched, false);
  assert.equal(song.isSearching, false);
  assert.equal(song.matchedBeatmap, null);
  assert.deepEqual(song.allMatches, []);
  assert.deepEqual(song.fallbacks, []);
  assert.deepEqual(song.queries, []);
  assert.equal(song.rejection, null);
});

test('makeSong passes every unknown field through untouched, and a caller field wins over a default', () => {
  const song = makeSong({
    source: 'osu-player',
    title: 'Idol',
    hasSearched: true,
    playerMeta: { rank: 1 },
    playerSection: 'best',
    position: 4,
  });
  assert.equal(song.title, 'Idol');
  assert.equal(song.hasSearched, true);
  assert.deepEqual(song.playerMeta, { rank: 1 });
  assert.equal(song.playerSection, 'best');
  assert.equal(song.position, 4);
});

test('songKey trusts a real provider id', () => {
  const a = { id: 'yt_abc123', extractedTitle: 'Idol', extractedArtist: 'YOASOBI' };
  const b = { id: 'yt_abc123', extractedTitle: 'Different Title', extractedArtist: 'Someone Else' };
  assert.equal(songKey(a), songKey(b));
});

test('songKey never trusts the extractor placeholder id shape, and falls back to title+artist', () => {
  const a = { id: 'track_0_1700000000000', extractedTitle: 'Idol', extractedArtist: 'YOASOBI' };
  const b = { id: 'track_0_1700000099999', extractedTitle: 'Idol', extractedArtist: 'YOASOBI' };
  assert.equal(songKey(a), songKey(b));

  const c = { id: 'track_1_1700000000001', extractedTitle: 'Racing Into The Night', extractedArtist: 'YOASOBI' };
  assert.notEqual(songKey(a), songKey(c));
});

test('mergeSongs: existing rows win on a collision', () => {
  const existing = [
    { id: 'yt_abc', title: 'Idol', hasSearched: true, matchedBeatmap: { id: 1 }, position: 0 },
  ];
  const incoming = [{ id: 'yt_abc', title: 'Idol (stale re-extraction)', hasSearched: false, matchedBeatmap: null }];

  const result = mergeSongs(existing, incoming);
  assert.equal(result.added, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.songs.length, 1);
  assert.equal(result.songs[0].title, 'Idol');
  assert.deepEqual(result.songs[0].matchedBeatmap, { id: 1 });
});

test('mergeSongs assigns position only to the rows actually added, continuing from existing.length', () => {
  const existing = [{ id: 'yt_1', title: 'One', position: 0 }];
  const incoming = [
    { id: 'yt_2', title: 'Two' },
    { id: 'yt_3', title: 'Three' },
  ];

  const result = mergeSongs(existing, incoming);
  assert.equal(result.added, 2);
  assert.equal(result.skipped, 0);
  assert.equal(result.songs[0].position, 0);
  assert.equal(result.songs[1].position, 1);
  assert.equal(result.songs[2].position, 2);
});

test('mergeSongs also dedupes duplicates within the incoming batch itself', () => {
  const existing = [];
  const incoming = [
    { id: 'yt_1', title: 'One' },
    { id: 'yt_1', title: 'One (duplicate)' },
  ];

  const result = mergeSongs(existing, incoming);
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.songs.length, 1);
});

test('mergeSongs never mutates the existing array it was given', () => {
  const existing = [{ id: 'yt_1', title: 'One', position: 0 }];
  const before = JSON.stringify(existing);
  mergeSongs(existing, [{ id: 'yt_2', title: 'Two' }]);
  assert.equal(JSON.stringify(existing), before);
});
