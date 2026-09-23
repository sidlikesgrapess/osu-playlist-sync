import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseAppleHtml, joinAppleArtists, appleTrackLockups, ExtractionError } from '../src/lib/extractors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(path.join(here, 'fixtures', name), 'utf8');

const PLAYLIST = fixture('apple-playlist.html');
const SONG = fixture('apple-song.html');

/** The fixture with its `serialized-server-data` body swapped for `body`. */
function withPayload(body) {
  return PLAYLIST.replace(
    /(<script type="application\/json" id="serialized-server-data">)[\s\S]*?(<\/script>)/,
    (_, open, close) => `${open}${body}${close}`,
  );
}

test('a real playlist page: ld+json is the track list, the payload supplies the artists', () => {
  const out = parseAppleHtml(PLAYLIST, { isSingle: false });
  assert.equal(out.title, 'Today’s Hits');
  assert.deepEqual(out.songs.map((s) => [s.title, s.channelTitle]), [
    ['So Good (feat. Kendrick Lamar)', 'Jhené Aiko'],
    ['stupid song', 'Olivia Rodrigo'],
    // an extra payload row sits before this one; the join walks past it
    ['BbY WOW', 'KAROL G, Judeline, rusowsky'],
    ["Choosin' Texas", 'Ella Langley'],
    // the payload has no row for this track: it stays empty and is never guessed
    ['Janice STFU', ''],
    // and the tracks after the gap still get their own artists
    ['Man I Need', 'Olivia Dean'],
    ['Rein Me In', 'Sam Fender, Olivia Dean'],
  ]);
});

test('the join pairs in order on the normalized title and skips rows that match nothing', () => {
  const lockups = [
    { title: 'Intro', artist: 'X' },
    { title: 'THE  Song!', artist: 'A' },
    { title: 'Other', artist: 'Y' },
    { title: 'Next', artist: 'B' },
  ];
  assert.deepEqual(joinAppleArtists(['Song', 'Missing', 'Next'], lockups), ['A', '', 'B']);
  // it never pairs backwards: a title that already went by is not reused
  assert.deepEqual(joinAppleArtists(['Next', 'Song'], lockups), ['B', '']);
  assert.deepEqual(joinAppleArtists(['a'], []), ['']);
});

test('payload rows come from every trackLockup section, in page order', () => {
  const body = JSON.stringify({
    data: [{ data: { sections: [
      { itemKind: 'trackLockup', items: [{ title: 'One', subtitleLinks: [{ title: 'A' }] }] },
      { itemKind: 'bubbleLockup', items: [{ title: 'Not a track', subtitleLinks: [{ title: 'Z' }] }] },
      { itemKind: 'trackLockup', items: [{ title: 'Two', subtitleLinks: [{ title: 'B' }, { title: 'C' }] }] },
    ] } }],
  });
  assert.deepEqual(appleTrackLockups(withPayload(body)), [
    { title: 'One', artist: 'A' },
    { title: 'Two', artist: 'B, C' },
  ]);
});

test('a missing or reshaped payload leaves every artist empty and never fails the playlist', () => {
  const variants = [
    PLAYLIST.replace(/<script type="application\/json" id="serialized-server-data">[\s\S]*?<\/script>/, ''),
    withPayload('not json {'),
    withPayload(JSON.stringify({ data: { sections: [] } })),
    withPayload(JSON.stringify({ data: [{ data: { shelves: [{ itemKind: 'trackLockup', items: [] }] } }] })),
    withPayload(JSON.stringify({ data: [{ data: { sections: [{ itemKind: 'trackLockup', items: [{ name: 'stupid song', artists: ['Olivia Rodrigo'] }] }] } }] })),
    withPayload(JSON.stringify({ data: [{ data: { sections: [{ itemKind: 'trackLockup', items: [{ title: 'stupid song', subtitleLinks: 'Olivia Rodrigo' }] }] } }] })),
  ];
  for (const html of variants) {
    const out = parseAppleHtml(html, { isSingle: false });
    assert.equal(out.songs.length, 7);
    assert.ok(out.songs.every((s) => s.channelTitle === ''), JSON.stringify(out.songs));
  }
});

test('script tags are found by attribute presence, in any order and quoting', () => {
  const reordered = PLAYLIST
    .replace('<script id=schema:music-playlist type="application/ld+json">', "<script type='application/ld+json' data-x id=\"schema:music-playlist\">")
    .replace('<script type="application/json" id="serialized-server-data">', '<script id=serialized-server-data type=application/json>');
  const out = parseAppleHtml(reordered, { isSingle: false });
  assert.equal(out.songs[1].channelTitle, 'Olivia Rodrigo');
});

test('an album with no payload row for a track falls back to the album byArtist', () => {
  const album = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'MusicAlbum', name: 'Album', byArtist: [{ name: 'YOASOBI' }],
    track: [{ '@type': 'MusicRecording', name: 'Idol' }, { '@type': 'MusicRecording', name: 'Yoru ni Kakeru' }],
  })}</script>`;
  const out = parseAppleHtml(album, { isSingle: false });
  assert.deepEqual(out.songs.map((s) => s.channelTitle), ['YOASOBI', 'YOASOBI']);
});

test('a collection with no tracks throws; it never becomes a single song standing in for it', () => {
  const empty = PLAYLIST.replace(/"track":\[[\s\S]*?\],"url"/, '"track":[],"url"');
  assert.notEqual(empty, PLAYLIST);
  assert.throws(() => parseAppleHtml(empty, { isSingle: false }), ExtractionError);
  // og:title is present on the page, and is still not used for a collection
  assert.throws(() => parseAppleHtml('<meta property="og:title" content="Mix by Someone on Apple Music">', { isSingle: false }), ExtractionError);
});

test('a single song: ld+json name is the title, og:title gives the artist in its exact form', () => {
  // the real og:title writes "Apple Music" with a no-break space
  assert.match(SONG, /Apple Music/);
  const out = parseAppleHtml(SONG, { isSingle: true });
  assert.deepEqual(out.songs, [{ title: 'Idol', channelTitle: 'YOASOBI' }]);
});

test('a single whose og:title does not read "<name> by <artist> on Apple Music" gets no artist', () => {
  const og = (content) => SONG.replace(/<meta property="og:title" content="[^"]*">/, `<meta content="${content}" property="og:title">`);
  for (const content of ['Idol on Apple Music', 'Idol (TV Size) by YOASOBI on Apple Music', 'Idol by YOASOBI', 'Stand by Me by Ben E. King on Apple Music']) {
    const out = parseAppleHtml(og(content), { isSingle: true });
    assert.equal(out.songs[0].title, 'Idol');
    assert.equal(out.songs[0].channelTitle, '', content);
  }
  // attribute order does not matter for the exact form itself
  assert.equal(parseAppleHtml(og('Idol by YOASOBI on Apple Music'), { isSingle: true }).songs[0].channelTitle, 'YOASOBI');
});

test('a title containing " by " is anchored on the ld+json name, never split on the first " by "', () => {
  const page = `<meta property="og:title" content="Stand by Me by Ben E. King on Apple Music">
<script type="application/ld+json">${JSON.stringify({ '@type': 'MusicRecording', name: 'Stand by Me' })}</script>`;
  assert.deepEqual(parseAppleHtml(page, { isSingle: true }).songs, [{ title: 'Stand by Me', channelTitle: 'Ben E. King' }]);
});

test('a single with no song ld+json throws', () => {
  assert.throws(() => parseAppleHtml('<meta property="og:title" content="Idol by YOASOBI on Apple Music">', { isSingle: true }), ExtractionError);
});
