import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeStem, osuFilename, contentDisposition } from '../src/lib/filename.js';

test('sanitizeStem replaces reserved characters and C0 controls', () => {
  assert.equal(sanitizeStem(String.raw`a\q/c*d?e:f"g<h>i|j`), 'a_q_c_d_e_f_g_h_i_j');
  assert.equal(sanitizeStem('tab\there\nnul\u0000end'), 'tab_here_nul_end');
});

test('sanitizeStem truncates the stem by code point, so the extension stays appendable', () => {
  const long = 'x'.repeat(400);
  const stem = sanitizeStem(long);
  assert.equal(Array.from(stem).length, 150);
  assert.ok(`${stem}.osz`.endsWith('.osz'));

  assert.equal(sanitizeStem('abcdef', { maxCodePoints: 3 }), 'abc');
  const name = osuFilename(1, 'A'.repeat(300), 'B'.repeat(300));
  assert.ok(name.endsWith('.osz'), 'osuFilename keeps .osz after truncation');
  assert.equal(Array.from(name).length, 154);
});

test('truncation never splits a surrogate pair', () => {
  // 149 ASCII then emoji: a UTF-16 slice at 150 would keep only the high surrogate.
  const input = `${'a'.repeat(149)}\u{1F3B5}\u{1F3B5}`;
  const stem = sanitizeStem(input);
  assert.equal(Array.from(stem).length, 150);
  assert.ok(stem.endsWith('\u{1F3B5}'));
  assert.doesNotThrow(() => encodeURIComponent(stem));
  assert.doesNotThrow(() => contentDisposition(`${stem}.osz`));
});

test('a lone surrogate in the input is replaced, never passed on', () => {
  const stem = sanitizeStem('bad\uD83Dhalf and \uDFB5other');
  assert.equal(stem, 'bad_half and _other');
  assert.doesNotThrow(() => encodeURIComponent(stem));
});

test('contentDisposition writes an ASCII fallback plus RFC 5987 with \'()* encoded', () => {
  const header = contentDisposition("41823 It's (Live) * Remix.osz");
  assert.equal(
    header,
    "attachment; filename=\"41823 It's (Live) _ Remix.osz\"; filename*=UTF-8''41823%20It%27s%20%28Live%29%20_%20Remix.osz",
  );
});

test('contentDisposition keeps non-ASCII in filename* and replaces it in the fallback', () => {
  const header = contentDisposition('1 夜に駆ける.osz');
  assert.match(header, /filename="1 _____\.osz"/);
  assert.match(header, /filename\*=UTF-8''1%20%E5%A4%9C%E3%81%AB%E9%A7%86%E3%81%91%E3%82%8B\.osz$/);
});

test('contentDisposition sanitizes its own input and keeps the extension on a long name', () => {
  const header = contentDisposition(`${'y'.repeat(300)}/"evil".osz`);
  assert.doesNotMatch(header, /\//);
  const ascii = header.match(/filename="([^"]*)"/)[1];
  assert.ok(ascii.endsWith('.osz'));
  assert.equal(ascii.length, 154);
});
