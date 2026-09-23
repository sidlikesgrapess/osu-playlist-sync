import { test } from 'node:test';
import assert from 'node:assert/strict';

const { buildSearchRequest } = await import('../src/lib/searchRequest.js');

const song = {
  title: 'Camellia - Ghost (Official Video)',
  channelTitle: 'Camellia Official',
  cleanQuery: 'Camellia Ghost',
  extractedTitle: 'Ghost',
  extractedArtist: 'Camellia',
  artistFromTitle: true,
  source: 'youtube',
  fallbacks: ['Ghost', 'Ghost Camellia'],
  queries: ['Camellia Ghost', 'Ghost'],
};

test('a song search sends the extracted fields, its provenance and its fallbacks once each', () => {
  const p = buildSearchRequest(song, { mode: 'osu', status: 'ranked', strictness: 50 });
  assert.equal(p.get('q'), 'Camellia Ghost');
  assert.equal(p.get('title'), 'Ghost');
  assert.equal(p.get('artist'), 'Camellia');
  assert.equal(p.get('source'), 'youtube');
  assert.equal(p.get('artistFromTitle'), '1');
  assert.deepEqual(JSON.parse(p.get('fallbacks')), ['Ghost', 'Ghost Camellia', 'Camellia Ghost']);
  assert.equal(p.get('mode'), 'osu');
  assert.equal(p.get('status'), 'ranked');
  assert.equal(p.get('strictness'), '50');
});

test('a typed query is sent bare: q and source query, no artist, no title, no fallbacks (F-05)', () => {
  const p = buildSearchRequest(song, { mode: 'all', status: 'any', strictness: 70, manualQuery: 'xi freedom dive' });
  assert.equal(p.get('q'), 'xi freedom dive');
  assert.equal(p.get('source'), 'query');
  for (const absent of ['artist', 'title', 'fallbacks', 'artistFromTitle']) assert.equal(p.has(absent), false, absent);
  assert.equal(p.get('strictness'), '70');
});

test('a song that remembers a typed query keeps sending it on every later re-search', () => {
  const p = buildSearchRequest({ ...song, manualQuery: 'typed earlier' }, { status: 'any' });
  assert.equal(p.get('q'), 'typed earlier');
  assert.equal(p.get('source'), 'query');
  assert.equal(p.has('artist'), false);
  assert.equal(p.has('strictness'), false, 'no strictness named, none sent');
});
