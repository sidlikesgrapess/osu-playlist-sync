import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanSongTitle } from '../src/lib/titleCleaner.js';
import { extractMusicData } from '../src/lib/extractors.js';

const spotify = (artist) => ({ source: 'spotify', providerArtist: artist });

test('F-28 repro: a provider artist stops the dash split, and a noise dash segment is dropped', () => {
  const r = cleanSongTitle('Kaikai Kitan - TV Size', 'Eve', spotify('Eve'));
  assert.equal(r.title, 'Kaikai Kitan');
  assert.equal(r.artist, 'Eve');
  assert.equal(r.artistFromTitle, false);

  // without the options the splitter still runs, which is the bug the options fix
  const old = cleanSongTitle('Kaikai Kitan - TV Size', 'Eve');
  assert.equal(old.artist, 'Kaikai Kitan');
  assert.equal(old.artistFromTitle, true);
});

test('a dash segment that is not noise stays part of the title', () => {
  const r = cleanSongTitle('Shape of You - Stormzy Remix', 'Ed Sheeran', spotify('Ed Sheeran'));
  assert.equal(r.title, 'Shape of You - Stormzy Remix');
  assert.equal(r.artist, 'Ed Sheeran');
});

test('every split branch is skipped when the provider supplied the artist', () => {
  const cases = [
    ['Re:Re:', 'Re:Re'], // colon
    ['Stand by Me', 'Stand by Me'], // by
    ['"Sound Asleep" - Chikafuji Lisa', 'Sound Asleep - Chikafuji Lisa'], // quoted
    ['Lemon - Kenshi Yonezu / Cover Rainych', 'Lemon - Kenshi Yonezu'], // cover (the trailing / Cover is stripped as noise first)
    ['Song | Part Two', 'Song | Part Two'], // pipe
    ['Song • Part Two', 'Song • Part Two'], // bullet
  ];
  for (const [raw, title] of cases) {
    const r = cleanSongTitle(raw, 'Some Artist', spotify('Some Artist'));
    assert.equal(r.title, title, raw);
    assert.equal(r.artist, 'Some Artist', raw);
    assert.equal(r.artistFromTitle, false, raw);
    assert.deepEqual(r.queries.slice(0, 2), [`Some Artist ${title}`, title], raw);
  }
});

test('the provider artist is whitespace normalized only, never put through the channel strips', () => {
  const r = cleanSongTitle('Song', '', { source: 'apple', providerArtist: '  Hollywood   Undead Records ' });
  assert.equal(r.artist, 'Hollywood Undead Records');
  const m = cleanSongTitle('Song', '', spotify('Tuxedo Music'));
  assert.equal(m.artist, 'Tuxedo Music');
});

test('an empty provider artist leaves the splitter on, and flags a split artist as from the title', () => {
  const r = cleanSongTitle('Re:Re:', '', { source: 'apple', providerArtist: '' });
  assert.equal(r.artist, 'Re');
  assert.equal(r.artistFromTitle, true);
});

test('artistFromTitle is false for a channel artist and true for each split shape', () => {
  assert.equal(cleanSongTitle('Feeling', 'Kaneko Lumi - Topic').artistFromTitle, false);
  assert.equal(cleanSongTitle('Alan Walker - Faded', 'MrSuicideSheep').artistFromTitle, true);
  assert.equal(cleanSongTitle('Faded by Alan Walker', '').artistFromTitle, true);
  assert.equal(cleanSongTitle('"Sound Asleep" - Chikafuji Lisa', '').artistFromTitle, true);
  assert.equal(cleanSongTitle('', '').artistFromTitle, false);
});

test('extractMusicData sets artistFromTitle beside extractedArtist', async () => {
  const q = await extractMusicData('YOASOBI - Idol');
  assert.equal(q.songs[0].extractedArtist, 'YOASOBI');
  assert.equal(q.songs[0].artistFromTitle, true);
});
