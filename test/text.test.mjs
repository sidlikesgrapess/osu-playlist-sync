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

test('the body is byte-identical to the private copy still in osu.js', () => {
  const bodyOf = (file) => {
    const src = readFileSync(path.join(here, '..', 'src', 'lib', file), 'utf8').replace(/\r\n/g, '\n');
    const m = src.match(/function normalizeForComparison\(str = ''\) \{\n[\s\S]*?\n\}/);
    assert.ok(m, `normalizeForComparison not found in ${file}`);
    return m[0];
  };
  assert.equal(bodyOf('text.js'), bodyOf('osu.js'));
});
