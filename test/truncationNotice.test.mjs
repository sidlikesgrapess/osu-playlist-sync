// The truncation popup copy (todo item 08, REBUILD_PLAN.md F-18).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { truncationMessage } from '../src/lib/truncationNotice.js';
import { PLAYLIST_LOAD_CAP } from '../src/lib/youtube.js';

const DASHES = /[-‐-―−]/;

test('with a readable length past the cap, the copy names both numbers', () => {
  assert.equal(
    truncationMessage({ playlistLength: 800, loadedCount: 500, loadCap: PLAYLIST_LOAD_CAP }),
    'This playlist has 800 songs. osu!Sync loads the first 500.',
  );
});

test('without a length, the copy says more than the cap', () => {
  assert.equal(
    truncationMessage({ playlistLength: null, loadedCount: 500, loadCap: PLAYLIST_LOAD_CAP }),
    'This playlist has more than 500 songs. osu!Sync loads the first 500.',
  );
});

test('the number follows the loadCap field, never a constant in the copy', () => {
  assert.equal(
    truncationMessage({ playlistLength: 300, loadedCount: 100, loadCap: 100 }),
    'This playlist has 300 songs. osu!Sync loads the first 100.',
  );
});

test('a walk cut short before the cap does not claim the cap', () => {
  assert.equal(
    truncationMessage({ playlistLength: 300, loadedCount: 100, loadCap: 500 }),
    'This playlist has 300 songs. osu!Sync could only load the first 100 this time.',
  );
  assert.equal(
    truncationMessage({ playlistLength: null, loadedCount: 200, loadCap: 500 }),
    'This playlist has more than 200 songs. osu!Sync could only load the first 200 this time.',
  );
});

test('no variant uses a dash as punctuation', () => {
  for (const args of [
    { playlistLength: 800, loadedCount: 500, loadCap: 500 },
    { playlistLength: null, loadedCount: 500, loadCap: 500 },
    { playlistLength: 300, loadedCount: 100, loadCap: 500 },
    { playlistLength: null, loadedCount: 100, loadCap: 500 },
  ]) {
    assert.doesNotMatch(truncationMessage(args), DASHES);
  }
});
