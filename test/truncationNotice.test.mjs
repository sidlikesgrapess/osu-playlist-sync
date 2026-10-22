// The truncation popup copy (todo item 08, REBUILD_PLAN.md F-18).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { truncationMessage } from '../src/lib/truncationNotice.js';

const DASHES = /[-‐-―−]/;

test('with a readable length, the copy names both numbers', () => {
  assert.equal(
    truncationMessage({ playlistLength: 800, loadedCount: 500 }),
    'This playlist has 800 songs. osu!Sync could only load the first 500 this time.',
  );
});

test('without a length, the copy says more than the loaded count', () => {
  assert.equal(
    truncationMessage({ playlistLength: null, loadedCount: 500 }),
    'This playlist has more than 500 songs. osu!Sync could only load the first 500 this time.',
  );
});

test('the number follows the loadedCount field', () => {
  assert.equal(
    truncationMessage({ playlistLength: 300, loadedCount: 100 }),
    'This playlist has 300 songs. osu!Sync could only load the first 100 this time.',
  );
});

test('a partial load does not claim a fixed cap', () => {
  assert.equal(
    truncationMessage({ playlistLength: null, loadedCount: 200 }),
    'This playlist has more than 200 songs. osu!Sync could only load the first 200 this time.',
  );
});

test('no variant uses a dash as punctuation', () => {
  for (const args of [
    { playlistLength: 800, loadedCount: 500 },
    { playlistLength: null, loadedCount: 500 },
    { playlistLength: 300, loadedCount: 100 },
    { playlistLength: null, loadedCount: 100 },
  ]) {
    assert.doesNotMatch(truncationMessage(args), DASHES);
  }
});
