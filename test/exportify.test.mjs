import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCsv, parseExportifyCsv, readExportifyFile, MAX_CSV_BYTES } from '../src/lib/exportify.js';

// The first rows of a real Exportify export (2026 column set), CRLF line ends and a BOM.
const HEADER = 'Track URI,ISRC,Track Name,Album Name,Artist Name(s),Release Date,Duration (ms),Popularity,Explicit,Added By,Added At,Genres,Record Label,Danceability,Energy,Key,Loudness,Mode,Speechiness,Acousticness,Instrumentalness,Liveness,Valence,Tempo,Time Signature';
const EXPORT = '﻿' + [
  HEADER,
  'spotify:track:2lPwh9FMLfYWzJ6xuChldE,CA5KR2382309,"Still Alive - Skeler Remix","Still Alive (Skeler Remix)","Mt. Eden;Skeler",2023-09-15,233644,50,false,x,2026-03-21T06:28:58Z,"chillstep,dubstep,witch house,drift phonk","Mt. Eden",0.649,0.833,1,-4.388,1,0.0303,0.0000714,0.897,0.0872,0.3,145.044,4',
  'spotify:track:2sJdI0rXeK5aEoKIR8bwH1,QM6N21816432,"Honeymoon","Horizon","Neovaii",2018-09-28,210000,22,false,x,2026-03-21T06:28:58Z,"","Vybelust",0.579,0.927,10,-3.74,0,0.0442,0.0289,0.0118,0.0832,0.23,160.089,4',
  'spotify:track:7LjalVbaR7UsYQFoqhxZ3b,USLD91713273,"califormula (Tarro Remix)","califormula (Tarro Remix)","blackbear;Tarro",2016-02-05,189517,23,true,x,2026-03-21T06:28:58Z,"","Santa Anna",0.406,0.84,10,-4.34,0,0.598,0.12,0.0228,0.112,0.429,144.662,4',
  '',
].join('\r\n');

test('parseCsv keeps quoted commas, doubled quotes and line breaks inside a field', () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi""\nthere"\n\n'), [
    ['a', 'b'],
    ['x, y', 'say "hi"\nthere'],
  ]);
});

test('an Exportify CSV becomes a Spotify playlist named after the file', () => {
  const data = parseExportifyCsv(EXPORT, 'Banggers.csv');
  assert.equal(data.platform, 'spotify');
  assert.equal(data.playlistTitle, 'Banggers');
  assert.equal(data.returnedCount, 3);
  assert.deepEqual(data.songs.map((s) => [s.title, s.channelTitle, s.duration]), [
    ['Still Alive - Skeler Remix', 'Mt. Eden, Skeler', 233644],
    ['Honeymoon', 'Neovaii', 210000],
    ['califormula (Tarro Remix)', 'blackbear, Tarro', 189517],
  ]);
});

test('CSV songs are cleaned like a pasted Spotify playlist, with the artist trusted', () => {
  const [remix, plain] = parseExportifyCsv(EXPORT, 'x.csv').songs;
  assert.equal(remix.source, 'spotify');
  assert.equal(remix.extractedArtist, 'Mt. Eden, Skeler');
  assert.equal(remix.artistFromTitle, false);
  assert.equal(remix.extractedTitle, 'Still Alive');
  assert.equal(plain.extractedTitle, 'Honeymoon');
  assert.equal(plain.id, null);
});

test('older Exportify column names are read too', () => {
  const old = 'Track URI,Track Name,Artist URI(s),Artist Name(s),Album Name,Track Duration (ms)\nspotify:track:1,"Idol","spotify:artist:9","YOASOBI","THE BOOK 3",213000\n';
  const [song] = parseExportifyCsv(old, 'my_old_list.csv').songs;
  assert.equal(song.title, 'Idol');
  assert.equal(song.duration, 213000);
  assert.equal(parseExportifyCsv(old, 'my_old_list.csv').playlistTitle, 'my old list');
});

test('a CSV that is not an Exportify export, or has no tracks, says so', () => {
  assert.throws(() => parseExportifyCsv('Title,Artist\nIdol,YOASOBI\n'), /Track Name and Artist Name\(s\)/);
  assert.throws(() => parseExportifyCsv(HEADER + '\n'), /no tracks/);
  assert.throws(() => parseExportifyCsv(''), /Track Name/);
});

test('readExportifyFile refuses an oversized file before reading it', async () => {
  const huge = { size: MAX_CSV_BYTES + 1, name: 'big.csv', text: () => assert.fail('read') };
  await assert.rejects(readExportifyFile(huge), /too large/);
  const data = await readExportifyFile(new Blob([EXPORT]));
  assert.equal(data.songs.length, 3);
});
