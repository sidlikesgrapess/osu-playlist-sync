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
  confirmedMatchIds,
} from '../src/lib/beatmapFormat.js';

test('isRankedStatus accepts exactly RANKED_LOVED_STATUSES, never qualified (U-8)', () => {
  for (const status of ['ranked', 'approved', 'loved', 'Ranked', 'LOVED']) {
    assert.equal(isRankedStatus(status), true, status);
  }
  for (const status of ['qualified', 'pending', 'wip', 'graveyard', '', undefined, null]) {
    assert.equal(isRankedStatus(status), false, String(status));
  }
});

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

test('confirmedMatchIds keeps only auto-selectable matches, in song order', () => {
  const songs = [
    { id: 'a', matchedBeatmap: { id: 1 } },
    { id: 'b', matchedBeatmap: { id: 2, artistOverride: true } },
    { id: 'c', matchedBeatmap: { id: 3, titleOnly: true } },
    { id: 'd', matchedBeatmap: null },
    { id: 'e' },
    { id: 'f', matchedBeatmap: { id: 6 } },
  ];
  assert.deepEqual(confirmedMatchIds(songs), ['a', 'f']);
});

test('confirmedMatchIds returns [] for an empty or missing list', () => {
  assert.deepEqual(confirmedMatchIds([]), []);
  assert.deepEqual(confirmedMatchIds(undefined), []);
});

test('confirmedMatchIds returns [] when every match is flagged', () => {
  const songs = [
    { id: 'b', matchedBeatmap: { artistOverride: true } },
    { id: 'c', matchedBeatmap: { titleOnly: true } },
  ];
  assert.deepEqual(confirmedMatchIds(songs), []);
});
