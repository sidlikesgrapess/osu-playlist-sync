import { test } from 'node:test';
import assert from 'node:assert/strict';

import JSZip from 'jszip';

import {
  parseCsv, parseExportifyCsv, readPlaylistFiles, combinePlaylists, failureMessage, MAX_CSV_BYTES,
} from '../src/lib/exportify.js';

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

const OTHER = `${HEADER}\nspotify:track:1,,"Idol","THE BOOK 3","YOASOBI",2023-04-12,213000\nspotify:track:2,,"Honeymoon","Horizon","Neovaii",2018-09-28,210000\n`;

test('several CSVs are read in order, each as its own playlist', async () => {
  const { playlists, failures } = await readPlaylistFiles([
    new File([EXPORT], 'Banggers.csv'),
    new File([OTHER], 'chill.csv'),
  ]);
  assert.deepEqual(failures, []);
  assert.deepEqual(playlists.map((p) => [p.playlistTitle, p.songs.length]), [['Banggers', 3], ['chill', 2]]);
});

test('an Export All .zip is opened and every .csv inside becomes a playlist', async () => {
  const zip = new JSZip();
  zip.file('spotify_playlists/Banggers.csv', EXPORT);
  zip.file('spotify_playlists/chill.csv', OTHER);
  zip.file('__MACOSX/spotify_playlists/._chill.csv', 'junk');
  zip.file('readme.txt', 'not a playlist');
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const { playlists, failures } = await readPlaylistFiles([new File([bytes], 'spotify_playlists.zip')]);
  assert.deepEqual(failures, []);
  assert.deepEqual(playlists.map((p) => p.playlistTitle), ['Banggers', 'chill']);
  // Each song remembers the file it came from, so the table can frame it under that name.
  assert.deepEqual([...new Set(playlists.flatMap((p) => p.songs.map((s) => s.sourceFile)))], ['Banggers.csv', 'chill.csv']);
});

test('an unreadable file is reported by name and never stops the rest', async () => {
  const empty = await new JSZip().generateAsync({ type: 'uint8array' });
  const huge = { name: 'big.csv', size: MAX_CSV_BYTES + 1, text: () => assert.fail('read') };
  const { playlists, failures } = await readPlaylistFiles([
    new File(['Title,Artist\nIdol,YOASOBI\n'], 'other.csv'),
    huge,
    new File(['not a zip'], 'broken.zip'),
    new File([empty], 'empty.zip'),
    new File(['x'], 'cover.png'),
    new File([EXPORT], 'Banggers.csv'),
  ]);
  assert.deepEqual(playlists.map((p) => p.playlistTitle), ['Banggers']);
  assert.deepEqual(failures.map((f) => f.name), ['other.csv', 'big.csv', 'broken.zip', 'empty.zip', 'cover.png']);
  assert.match(failures[1].error, /too large/);
  assert.match(failures[2].error, /could not be opened/);
  assert.match(failures[3].error, /no \.csv files/);
  assert.match(failures[4].error, /Only \.csv and \.zip/);
});

test('failureMessage names the file only when there is more than one', () => {
  assert.equal(failureMessage([{ name: 'a.csv', error: 'Bad.' }]), 'Bad.');
  assert.equal(
    failureMessage([{ name: 'a.csv', error: 'Bad.' }, { name: 'b.zip', error: 'Worse.' }]),
    'None of the 2 files could be read. a.csv: Bad.',
  );
});

test('combinePlaylists loads several as one answer, numbered straight through', () => {
  const a = parseExportifyCsv(EXPORT, 'Banggers.csv');
  const b = parseExportifyCsv(OTHER, 'chill.csv');
  assert.equal(combinePlaylists([a]), a);
  const both = combinePlaylists([a, b]);
  assert.equal(both.playlistTitle, 'Banggers and 1 more playlist');
  assert.equal(both.platform, 'spotify');
  assert.equal(both.returnedCount, 5);
  assert.deepEqual(both.songs.map((s) => s.index), [1, 2, 3, 4, 5]);
  // Cleaned per playlist, so a song keeps what its own playlist made of it.
  assert.deepEqual(both.songs[3], { ...b.songs[0], index: 4, position: 3 });
  assert.equal(combinePlaylists([a, b, b]).playlistTitle, 'Banggers and 2 more playlists');
});
