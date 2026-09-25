import { test } from 'node:test';
import assert from 'node:assert/strict';

import { playerViewScreen, isRetainedPlayer } from '../src/lib/playerView.js';

const profile = { id: 7, username: 'alpha' };

test('a loaded profile shows the profile screen', () => {
  assert.deepEqual(playerViewScreen({ profile, resultsCount: 3 }), { screen: 'profile', backTo: null });
  assert.deepEqual(playerViewScreen({ profile }), { screen: 'profile', backTo: null });
});

test('Change Player with a results list shows the list and keeps the profile to go back to', () => {
  assert.deepEqual(playerViewScreen({ profile, resultsCount: 3, browsing: true }), { screen: 'results', backTo: profile });
});

test('Change Player after a pasted link shows the empty view with a way back', () => {
  assert.deepEqual(playerViewScreen({ profile, resultsCount: 0, browsing: true }), { screen: 'empty', backTo: profile });
});

test('no profile shows the results list, or nothing', () => {
  assert.deepEqual(playerViewScreen({ resultsCount: 2 }), { screen: 'results', backTo: null });
  assert.deepEqual(playerViewScreen({ resultsCount: 2, browsing: true }), { screen: 'results', backTo: null });
});

test('after the trash everything is gone: the empty view with no way back', () => {
  assert.deepEqual(playerViewScreen({ profile: null, resultsCount: 0, browsing: false }), { screen: 'empty', backTo: null });
  assert.deepEqual(playerViewScreen(), { screen: 'empty', backTo: null });
});

test('isRetainedPlayer compares ids loosely typed', () => {
  assert.equal(isRetainedPlayer(profile, { id: 7 }), true);
  assert.equal(isRetainedPlayer(profile, { id: '7' }), true);
  assert.equal(isRetainedPlayer(profile, { id: 8 }), false);
  assert.equal(isRetainedPlayer(null, { id: 7 }), false);
  assert.equal(isRetainedPlayer(profile, null), false);
});
