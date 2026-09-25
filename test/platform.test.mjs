import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyInput, buildProviderUrl, PLATFORM_HOSTS, submitPlatform, SEARCH_MODES } from '../src/lib/platform.js';

test('a title containing a colon stays a query, never a link', () => {
  assert.deepEqual(classifyInput('YOASOBI: Idol'), { kind: 'query', query: 'YOASOBI: Idol' });
});

test('a title containing a colon and a real host name stays a query', () => {
  assert.deepEqual(classifyInput('Re:Zero'), { kind: 'query', query: 'Re:Zero' });
});

test('a host embedded in a query string of an unrelated URL is not the SSRF hole (F-02)', () => {
  const result = classifyInput('https://example.com/?x=music.apple.com');
  assert.equal(result.kind, 'invalid');
});

test('a host that merely starts with a known host is not that host (F-02)', () => {
  const result = classifyInput('music.apple.com.evil.com');
  assert.equal(result.kind, 'query');
});

test('a trailing dot on an otherwise valid host is still recognised', () => {
  const result = classifyInput('https://music.apple.com./album/1440935467');
  assert.equal(result.kind, 'apple');
  assert.ok(result.url);
});

test('a bare host + path with no scheme is recognised, and the player kind needs /users/ or /u/', () => {
  const result = classifyInput('osu.ppy.sh/users/2');
  assert.equal(result.kind, 'player');
  assert.equal(result.url, 'https://osu.ppy.sh/users/2');
});

test('a known host without the required player path is invalid, not silently a query', () => {
  const result = classifyInput('osu.ppy.sh/beatmapsets/1');
  assert.equal(result.kind, 'invalid');
});

test('an http (not https) link on a known host is invalid', () => {
  const result = classifyInput('http://open.spotify.com/track/abc');
  assert.equal(result.kind, 'invalid');
});

test('host classification is case- and scheme-insensitive on casing', () => {
  const result = classifyInput('https://OPEN.SPOTIFY.COM/track/abc');
  assert.equal(result.kind, 'spotify');
});

test('plain text with no host at all is a query', () => {
  assert.deepEqual(classifyInput('imagine dragons believer'), {
    kind: 'query',
    query: 'imagine dragons believer',
  });
});

test('empty or whitespace-only input is invalid', () => {
  assert.equal(classifyInput('').kind, 'invalid');
  assert.equal(classifyInput('   ').kind, 'invalid');
});

test('PLATFORM_HOSTS lists every host classifyInput actually recognises', () => {
  for (const host of PLATFORM_HOSTS.youtube) {
    const result = classifyInput(`https://${host}/watch?v=abc`);
    assert.equal(result.kind, 'youtube');
  }
});

test('buildProviderUrl builds the canonical link for each known kind', () => {
  assert.equal(buildProviderUrl('youtube', 'abc123'), 'https://www.youtube.com/watch?v=abc123');
  assert.equal(buildProviderUrl('player', '2'), 'https://osu.ppy.sh/users/2');
  assert.equal(buildProviderUrl('spotify', 'track/abc123'), 'https://open.spotify.com/track/abc123');
  assert.equal(buildProviderUrl('apple', 'playlist/xyz'), 'https://music.apple.com/playlist/xyz');
});

test('buildProviderUrl rejects an unknown kind rather than guessing a shape', () => {
  assert.throws(() => buildProviderUrl('bogus', '1'));
});

test('submitPlatform: songs mode routes plain text to a single song search', () => {
  assert.equal(submitPlatform('songs', 'YOASOBI - Idol'), 'query');
});

test('submitPlatform: songs mode routes a link to its provider', () => {
  assert.equal(submitPlatform('songs', 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'), 'spotify');
  assert.equal(submitPlatform('songs', 'https://www.youtube.com/playlist?list=PLx'), 'youtube');
  assert.equal(submitPlatform('songs', 'https://music.apple.com/us/album/1440935467'), 'apple');
});

test('submitPlatform: songs mode still sends an osu! profile link to the player view', () => {
  assert.equal(submitPlatform('songs', 'https://osu.ppy.sh/users/2'), 'player');
});

test('submitPlatform: songs mode with empty or unusable text detects nothing', () => {
  assert.equal(submitPlatform('songs', ''), 'auto');
  assert.equal(submitPlatform('songs', 'https://example.com/x'), 'auto');
});

test('submitPlatform: player mode always goes to player search, even for a link', () => {
  assert.equal(submitPlatform('player', 'mrekk'), 'player');
  assert.equal(submitPlatform('player', 'https://open.spotify.com/track/abc'), 'player');
});

test('SEARCH_MODES is exactly the two toggle segments', () => {
  assert.deepEqual(SEARCH_MODES, ['songs', 'player']);
});
