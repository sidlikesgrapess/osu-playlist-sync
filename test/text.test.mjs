import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { normalizeForComparison } from '../src/lib/text.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('normalizeForComparison lowercases, drops a leading "the", punctuation and extra spaces', () => {
  assert.equal(normalizeForComparison('The  Kids Aren\'t Alright!'), 'kids aren t alright');
  assert.equal(normalizeForComparison('  Re:Re:  '), 're re');
  assert.equal(normalizeForComparison(), '');
});

test('normalizeForComparison keeps non-Latin letters instead of collapsing them to empty', () => {
  assert.equal(normalizeForComparison('アイドル'), 'アイドル');
  assert.equal(normalizeForComparison('夜に駆ける (Yoru ni Kakeru)'), '夜に駆ける yoru ni kakeru');
});

test('osu.js uses this normalizer and keeps no private copy of it', () => {
  const src = readFileSync(path.join(here, '..', 'src', 'lib', 'osu.js'), 'utf8');
  assert.match(src, /import \{ normalizeForComparison \} from '\.\/text\.js';/);
  assert.doesNotMatch(src, /function normalizeForComparison\(/);
});
