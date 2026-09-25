import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import {
  BOUNCE_STORAGE_KEY,
  BOUNCE_CLASS,
  BOUNCE_BOOT_SCRIPT,
  isBounceEnabled,
  saveBounceEnabled,
  applyBounceClass,
} from '../src/lib/bouncePref.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}
const throwingStorage = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('SecurityError'); },
};
function fakeRoot() {
  const set = new Set();
  return {
    set,
    classList: {
      add: (c) => set.add(c),
      toggle: (c, on) => (on ? set.add(c) : set.delete(c)),
    },
  };
}

test('bounce is off unless the stored value is exactly "true"', () => {
  assert.equal(isBounceEnabled(fakeStorage()), false, 'missing key means off');
  assert.equal(isBounceEnabled(fakeStorage({ [BOUNCE_STORAGE_KEY]: 'false' })), false);
  assert.equal(isBounceEnabled(fakeStorage({ [BOUNCE_STORAGE_KEY]: '1' })), false);
  assert.equal(isBounceEnabled(fakeStorage({ [BOUNCE_STORAGE_KEY]: 'true' })), true);
  assert.equal(isBounceEnabled(throwingStorage), false, 'blocked storage means off');
  assert.equal(isBounceEnabled(null), false);
});

test('saving writes "true" / "false" and survives a blocked storage', () => {
  const s = fakeStorage();
  saveBounceEnabled(true, s);
  assert.equal(s.data[BOUNCE_STORAGE_KEY], 'true');
  saveBounceEnabled(false, s);
  assert.equal(s.data[BOUNCE_STORAGE_KEY], 'false');
  assert.doesNotThrow(() => saveBounceEnabled(true, throwingStorage));
});

test('applyBounceClass adds and removes the root class', () => {
  const root = fakeRoot();
  applyBounceClass(root, true);
  assert.ok(root.set.has(BOUNCE_CLASS));
  applyBounceClass(root, false);
  assert.ok(!root.set.has(BOUNCE_CLASS));
  assert.doesNotThrow(() => applyBounceClass(null, true));
});

test('boot script sets the class only for a stored "true" and never throws', () => {
  const run = (localStorage) => {
    const root = fakeRoot();
    vm.runInNewContext(BOUNCE_BOOT_SCRIPT, { localStorage, document: { documentElement: root } });
    return root.set.has(BOUNCE_CLASS);
  };
  assert.equal(run(fakeStorage({ [BOUNCE_STORAGE_KEY]: 'true' })), true);
  assert.equal(run(fakeStorage({ [BOUNCE_STORAGE_KEY]: 'false' })), false);
  assert.equal(run(fakeStorage()), false);
  assert.equal(run(throwingStorage), false);
});

test('layout.js inlines the boot script and allows the html class to differ', () => {
  const layout = read('../src/app/layout.js');
  assert.match(layout, /BOUNCE_BOOT_SCRIPT/);
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(layout, /<head>[\s\S]*<script[\s\S]*<\/head>/);
});

test('every osu-bounce rule sits inside a reduced-motion no-preference, hover media block', () => {
  const css = read('../src/app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
  // Walk the stylesheet, tracking which @media blocks enclose each rule.
  const stack = [];
  let prelude = '';
  const bounceRules = [];
  for (const ch of css) {
    if (ch === '{') {
      stack.push(prelude.trim());
      prelude = '';
    } else if (ch === '}') {
      stack.pop();
      prelude = '';
    } else if (ch === ';') {
      prelude = '';
    } else {
      prelude += ch;
    }
    if (ch === '{' && stack[stack.length - 1].includes(`.${BOUNCE_CLASS}`)) {
      bounceRules.push(stack.slice(0, -1).filter((p) => p.startsWith('@media')));
    }
  }
  assert.ok(bounceRules.length > 0, 'expected at least one html.osu-bounce rule');
  for (const media of bounceRules) {
    const joined = media.join(' ');
    assert.match(joined, /prefers-reduced-motion:\s*no-preference/);
    assert.match(joined, /hover:\s*hover/);
  }
});
