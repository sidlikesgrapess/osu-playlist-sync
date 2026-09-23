import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import JSZip from 'jszip';

import {
  isValidArchiveBlob,
  hasZipHead,
  hasEocd,
  MIN_ARCHIVE_BYTES,
  EOCD_SEARCH_BYTES,
} from '../src/lib/archive.js';

/** A real ZIP, stored uncompressed so random bytes keep it well above MIN_ARCHIVE_BYTES. */
async function realArchive(bytes = 200 * 1024) {
  const zip = new JSZip();
  zip.file('song.osu', 'osu file format v14\n');
  zip.file('audio.mp3', randomBytes(bytes));
  const buf = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  return new Blob([buf]);
}

test('a complete archive passes', async () => {
  assert.equal(await isValidArchiveBlob(await realArchive()), true);
});

test('an archive with a comment near the maximum length still passes', async () => {
  const zip = new JSZip();
  zip.file('audio.mp3', randomBytes(64 * 1024));
  const buf = await zip.generateAsync({ type: 'uint8array', compression: 'STORE', comment: 'c'.repeat(65000) });
  assert.equal(await isValidArchiveBlob(new Blob([buf])), true);
});

test('a 50% truncated archive fails the EOCD check', async () => {
  const full = await realArchive();
  const truncated = full.slice(0, Math.floor(full.size / 2));
  assert.ok(truncated.size >= MIN_ARCHIVE_BYTES, 'truncated blob is still big enough');
  assert.equal(await isValidArchiveBlob(truncated), false);
});

test('a head-only check is insufficient: the truncated body still has a ZIP head', async () => {
  const full = await realArchive();
  const truncated = full.slice(0, Math.floor(full.size / 2));
  const head = new Uint8Array(await truncated.slice(0, 4).arrayBuffer());
  const tail = new Uint8Array(await truncated.slice(-EOCD_SEARCH_BYTES).arrayBuffer());
  assert.equal(hasZipHead(head), true, 'head-only would accept it');
  assert.equal(hasEocd(tail), false, 'the missing EOCD is what rejects it');
  assert.equal(await isValidArchiveBlob(truncated), false);
});

test('a blob under MIN_ARCHIVE_BYTES fails even when it is a real ZIP', async () => {
  const zip = new JSZip();
  zip.file('a.txt', 'tiny');
  const buf = await zip.generateAsync({ type: 'uint8array' });
  assert.ok(buf.length < MIN_ARCHIVE_BYTES);
  assert.equal(await isValidArchiveBlob(new Blob([buf])), false);
});

test('an HTML error page padded past the minimum fails the head check', async () => {
  const html = `<!doctype html><title>404</title>${' '.repeat(MIN_ARCHIVE_BYTES)}PK\x05\x06`;
  assert.equal(await isValidArchiveBlob(new Blob([html])), false);
});

test('missing or non-blob input is not an archive', async () => {
  assert.equal(await isValidArchiveBlob(null), false);
  assert.equal(await isValidArchiveBlob(undefined), false);
  assert.equal(await isValidArchiveBlob({}), false);
});

test('hasZipHead and hasEocd reject short input', () => {
  assert.equal(hasZipHead(new Uint8Array([0x50, 0x4b])), false);
  assert.equal(hasEocd(new Uint8Array([0x50, 0x4b, 0x05])), false);
  assert.equal(hasEocd(new Uint8Array([0, 0x50, 0x4b, 0x05, 0x06])), true);
});
