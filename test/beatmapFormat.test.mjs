import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getStarColor,
  formatCompactNumber,
  isRankedStatus,
  getStatusBadgeStyle,
  describeRejection,
  RANKED_LOVED_STATUSES,
  upstreamStatusFor,
  isAutoSelectable,
  overrideNoticeFor,
} from '../src/lib/beatmapFormat.js';

test('existing exports are untouched (no behaviour change in this workstream)', () => {
  assert.equal(typeof getStarColor, 'function');
  assert.equal(typeof formatCompactNumber, 'function');
  assert.equal(typeof isRankedStatus, 'function');
  assert.equal(typeof getStatusBadgeStyle, 'function');
  assert.equal(typeof describeRejection, 'function');
});

test('RANKED_LOVED_STATUSES has no qualified (U-8)', () => {
  assert.deepEqual(RANKED_LOVED_STATUSES, ['ranked', 'approved', 'loved']);
});

test('upstreamStatusFor maps ranked to the leaderboard param, everything else to any', () => {
  assert.equal(upstreamStatusFor('ranked'), 'leaderboard');
  assert.equal(upstreamStatusFor('Ranked'), 'leaderboard');
  assert.equal(upstreamStatusFor('all'), 'any');
  assert.equal(upstreamStatusFor('loved'), 'any');
  assert.equal(upstreamStatusFor(undefined), 'any');
});

test('isAutoSelectable: an ordinary beatmapset is selectable', () => {
  assert.equal(isAutoSelectable({ id: 1 }), true);
});

test('isAutoSelectable: artistOverride is never auto-selectable', () => {
  assert.equal(isAutoSelectable({ id: 1, artistOverride: true }), false);
});

test('isAutoSelectable: titleOnly is never auto-selectable', () => {
  assert.equal(isAutoSelectable({ id: 1, titleOnly: true }), false);
});

test('isAutoSelectable: a missing beatmapset is never auto-selectable', () => {
  assert.equal(isAutoSelectable(null), false);
  assert.equal(isAutoSelectable(undefined), false);
});

test('overrideNoticeFor: an ordinary beatmapset gets no notice', () => {
  assert.equal(overrideNoticeFor({ id: 1 }, { extractedArtist: 'YOASOBI' }), null);
});

test('overrideNoticeFor: artistOverride with a known target artist names it', () => {
  const notice = overrideNoticeFor({ id: 1, artistOverride: true }, { extractedArtist: 'YOASOBI' });
  assert.deepEqual(notice, { kind: 'artist', artist: 'YOASOBI' });
});

test('overrideNoticeFor: artistOverride with no target artist falls back to closest', () => {
  const notice = overrideNoticeFor({ id: 1, artistOverride: true }, { extractedArtist: '' });
  assert.deepEqual(notice, { kind: 'closest' });

  const noSongAtAll = overrideNoticeFor({ id: 1, artistOverride: true }, undefined);
  assert.deepEqual(noSongAtAll, { kind: 'closest' });
});

test('overrideNoticeFor: titleOnly is its own kind, regardless of artist', () => {
  const notice = overrideNoticeFor({ id: 1, titleOnly: true }, { extractedArtist: 'YOASOBI' });
  assert.deepEqual(notice, { kind: 'title' });
});

test('overrideNoticeFor: no beatmapset at all is null', () => {
  assert.equal(overrideNoticeFor(null, { extractedArtist: 'YOASOBI' }), null);
});
