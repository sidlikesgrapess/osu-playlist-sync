/**
 * Reads a playlist CSV made by Exportify (exportify.net), which exports any Spotify playlist,
 * private ones and Liked Songs included, with one row per track. It runs in the browser: the
 * file is never sent anywhere, only its songs go on to be searched like a pasted playlist.
 */

import { preparePlaylist } from './song.js';

// Exportify's own columns. Its newer exports split several artists with ';', older ones with ','.
const TITLE_COLUMN = 'track name';
const ARTIST_COLUMN = 'artist name(s)';
const DURATION_COLUMN = /^(track )?duration \(ms\)$/;

// A playlist of 10,000 tracks with every audio feature column is about 4 MB.
export const MAX_CSV_BYTES = 10_000_000;

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
    }))
    .filter((song) => song.title);
  if (songs.length === 0) throw new Error('That CSV has no tracks in it.');

  const title = fileName.replace(/\.csv$/i, '').replace(/_/g, ' ').trim() || 'Spotify CSV';
  return preparePlaylist({ platform: 'spotify', title, songs, isSingleTrack: false });
}

/** Reads an uploaded File (or Blob) and parses it with `parseExportifyCsv`. */
export async function readExportifyFile(file) {
  if (file.size > MAX_CSV_BYTES) throw new Error('That CSV is too large. Export one playlist at a time.');
  return parseExportifyCsv(await file.text(), file.name);
}
