import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractMusicData } from '../src/lib/extractors.js';
import { mergeSongs } from '../src/lib/song.js';

// The id page.js gives a row with no provider id (handleFetchPlaylist).
const asPageRows = (songs, batchTag) => songs.map((s, index) => ({ ...s, id: s.id || `track_${batchTag}_${index}` }));

test('F-45: the extractor makes no id of its own for a row without a provider id', async () => {
  const q = await extractMusicData('YOASOBI - Idol');
  assert.equal(q.songs[0].id, null);
});

test('F-27: appending the same extraction twice adds nothing and reports every row as skipped', async () => {
  const first = asPageRows((await extractMusicData('YOASOBI - Idol')).songs, 1700000000000);
  const again = asPageRows((await extractMusicData('YOASOBI - Idol')).songs, 1700000009999);
  const loaded = mergeSongs([], first);
  const appended = mergeSongs(loaded.songs, again);
  assert.equal(appended.added, 0);
  assert.equal(appended.skipped, 1);
  assert.equal(appended.songs.length, 1);
  assert.equal(appended.songs[0].id, first[0].id);
});

test('a batch that lists one provider id twice keeps one row, so React keys stay unique', () => {
  const rows = asPageRows([
    { id: 'aaaaaaaaaaa', title: 'A' },
    { id: 'bbbbbbbbbbb', title: 'B' },
    { id: 'aaaaaaaaaaa', title: 'A' },
  ], 1700000000000);
  const out = mergeSongs([], rows);
  assert.deepEqual(out.songs.map((s) => s.id), ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  assert.deepEqual(out.songs.map((s) => s.position), [0, 1]);
  assert.equal(out.skipped, 1);
});
