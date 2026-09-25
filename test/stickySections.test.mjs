import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DOCK_TOP, dockTopFrom, parseDockTop, isHeaderDocked, collapseScrollTarget
} from '../src/lib/stickySections.js';

test('the dock line is the bar sticky top plus its live height', () => {
  assert.equal(dockTopFrom({ stickyTop: 56, height: 120 }), 176);
  assert.equal(dockTopFrom({ stickyTop: 56, height: 98.4 }), 154.4);
  // Not measured yet: fall back to the navbar line, never NaN.
  assert.equal(dockTopFrom({ stickyTop: NaN, height: undefined }), DEFAULT_DOCK_TOP);
});

test('the published variable parses back, with a fallback for missing values', () => {
  assert.equal(parseDockTop('176px'), 176);
  assert.equal(parseDockTop(' 154.4px '), 154.4);
  assert.equal(parseDockTop(''), DEFAULT_DOCK_TOP);
  assert.equal(parseDockTop(undefined, 80), 80);
});

test('a header is docked only once its card has scrolled above the dock line', () => {
  assert.equal(isHeaderDocked({ cardTop: 400, dockTop: 176 }), false);
  assert.equal(isHeaderDocked({ cardTop: 176, dockTop: 176 }), false);
  assert.equal(isHeaderDocked({ cardTop: 175.8, dockTop: 176 }), false, 'sub pixel rest is not docked');
  assert.equal(isHeaderDocked({ cardTop: -900, dockTop: 176 }), true);
});

test('collapsing a section that is not docked leaves the scroll alone', () => {
  assert.equal(collapseScrollTarget({ cardTop: 300, scrollY: 1200, dockTop: 176 }), null);
  assert.equal(collapseScrollTarget({ cardTop: 176, scrollY: 1200, dockTop: 176 }), null);
});

test('collapsing a docked section scrolls its card top onto the dock line', () => {
  // Card top is 1500px above the viewport at scrollY 2400: its page top is 900, so the
  // header rests at the dock when scrollY is 900 minus 176.
  assert.equal(collapseScrollTarget({ cardTop: -1500, scrollY: 2400, dockTop: 176 }), 724);
  assert.equal(collapseScrollTarget({ cardTop: 100.4, scrollY: 50, dockTop: 176 }), 0, 'never negative');
});
