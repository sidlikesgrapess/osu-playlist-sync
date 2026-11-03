/**
 * Reads a playlist CSV made by Exportify (exportify.net), which exports any Spotify playlist,
 * private ones and Liked Songs included, with one row per track, and Export All puts every
 * playlist's CSV in one .zip. It runs in the browser: no file is sent anywhere, only the
 * songs go on to be searched like a pasted playlist.
 */

import { preparePlaylist } from './song.js';

// Exportify's own columns. Its newer exports split several artists with ';', older ones with ','.
const TITLE_COLUMN = 'track name';
const ARTIST_COLUMN = 'artist name(s)';
const DURATION_COLUMN = /^(track )?duration \(ms\)$/;

// A playlist of 10,000 tracks with every audio feature column is about 4 MB.
export const MAX_CSV_BYTES = 10_000_000;
// An Export All .zip compresses those about tenfold.
export const MAX_ZIP_BYTES = 50_000_000;

/**
 * Splits CSV text into rows of fields (RFC 4180): quoted fields may hold commas, line breaks
 * and doubled quotes. A leading byte order mark and blank lines are dropped.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim()));
}

/**
 * The playlist in an Exportify CSV, in the /api/playlist answer's shape. The playlist is
 * named after the file, since the CSV itself does not carry its name.
 * @param {string} text
 * @param {string} [fileName]
 */
export function parseExportifyCsv(text, fileName = '') {
  const [header = [], ...rows] = parseCsv(text);
  const columns = header.map((h) => h.trim().toLowerCase());
  const titleAt = columns.indexOf(TITLE_COLUMN);
  const artistAt = columns.indexOf(ARTIST_COLUMN);
  const durationAt = columns.findIndex((c) => DURATION_COLUMN.test(c));
  if (titleAt < 0 || artistAt < 0) {
    throw new Error('That CSV has no Track Name and Artist Name(s) columns. Export the playlist with Exportify and upload that file.');
  }

  const songs = rows
    .map((fields) => ({
      title: (fields[titleAt] || '').trim(),
      channelTitle: (fields[artistAt] || '').split(/\s*;\s*/).filter(Boolean).join(', '),
      thumbnail: null,
      duration: Number(fields[durationAt]) || null,
      sourceFile: fileName || null,
    }))
    .filter((song) => song.title);
  if (songs.length === 0) throw new Error('That CSV has no tracks in it.');

  const title = fileName.replace(/\.csv$/i, '').replace(/_/g, ' ').trim() || 'Spotify CSV';
  return preparePlaylist({ platform: 'spotify', title, songs, isSingleTrack: false });
}

const TOO_LARGE = 'That CSV is too large. Export one playlist at a time.';
const IGNORED_ZIP_ENTRY = /(^|\/)(__MACOSX\/|\._)/;
const baseName = (path) => path.split('/').pop();

/**
 * Every playlist in the picked files, in order: a .csv as it is, a .zip (Exportify's Export
 * All) opened here in the browser, one playlist per .csv inside. A file that cannot be read
 * goes into `failures` with the reason and never stops the rest. Never throws.
 * @param {File[]} files
 * @returns {Promise<{ playlists: object[], failures: { name: string, error: string }[] }>}
 */
export async function readPlaylistFiles(files) {
  const playlists = [];
  const failures = [];

  const readCsv = async (name, size, getText) => {
    try {
      if (size > MAX_CSV_BYTES) throw new Error(TOO_LARGE);
      const text = await getText();
      if (text.length > MAX_CSV_BYTES) throw new Error(TOO_LARGE);
      playlists.push(parseExportifyCsv(text, name));
    } catch (err) {
      failures.push({ name, error: err.message });
    }
  };

  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      let entries;
      try {
        if (file.size > MAX_ZIP_BYTES) throw new Error('That .zip is too large.');
        const { default: JSZip } = await import('jszip');
        const zip = await JSZip.loadAsync(await file.arrayBuffer()).catch(() => {
          throw new Error('That .zip could not be opened.');
        });
        entries = Object.values(zip.files)
          .filter((entry) => !entry.dir && /\.csv$/i.test(entry.name) && !IGNORED_ZIP_ENTRY.test(entry.name));
        if (entries.length === 0) throw new Error('That .zip has no .csv files in it.');
      } catch (err) {
        failures.push({ name: file.name, error: err.message });
        continue;
      }
      for (const entry of entries) await readCsv(baseName(entry.name), 0, () => entry.async('string'));
    } else if (/\.csv$/i.test(file.name)) {
      await readCsv(file.name, file.size, () => file.text());
    } else {
      failures.push({ name: file.name, error: 'Only .csv and .zip files can be read.' });
    }
  }
  return { playlists, failures };
}

/** The one line an upload that read nothing at all shows in the error banner. */
export function failureMessage(failures) {
  if (failures.length === 1) return failures[0].error;
  const [first] = failures;
  return `None of the ${failures.length} files could be read. ${first.name}: ${first.error}`;
}

/**
 * Several read playlists as one /api/playlist answer, in the order given, so they load in a
 * single batch. Each was cleaned as its own playlist; only the row numbers run on.
 */
export function combinePlaylists(playlists) {
  if (playlists.length === 1) return playlists[0];
  const [first, ...rest] = playlists;
  const songs = playlists.flatMap((p) => p.songs).map((song, i) => ({ ...song, index: i + 1, position: i }));
  return {
    ...first,
    playlistTitle: `${first.playlistTitle} and ${rest.length} more playlist${rest.length === 1 ? '' : 's'}`,
    totalSongs: songs.length,
    songs,
    returnedCount: songs.length,
    loadedCount: songs.length,
  };
}
