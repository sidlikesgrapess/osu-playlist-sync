import { test } from 'node:test';
import assert from 'node:assert/strict';

import nextConfig from '../next.config.mjs';
import { MIRROR_HOSTS } from '../src/lib/mirrors.js';

const headersFor = async () => {
  const rules = await nextConfig.headers();
  const all = rules.find((r) => r.source === '/:path*');
  return Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
};

test('the CSP is enforcing and restricts only the directives it names', async () => {
  const h = await headersFor();
  assert.equal(h['Content-Security-Policy-Report-Only'], undefined);
  const csp = h['Content-Security-Policy'];
  const directives = Object.fromEntries(csp.split('; ').map((d) => {
    const [name, ...sources] = d.split(' ');
    return [name, sources];
  }));
  assert.deepEqual(Object.keys(directives).sort(), ['connect-src', 'frame-ancestors', 'img-src', 'media-src']);
  assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
  assert.deepEqual(directives['media-src'], ['https://b.ppy.sh']);
  for (const host of ['assets.ppy.sh', 'a.ppy.sh', 'i.ytimg.com', 'lh3.googleusercontent.com', 'i.scdn.co', '*.mzstatic.com']) {
    assert.ok(directives['img-src'].includes(`https://${host}`), host);
  }
  // connect-src comes from the mirror table, never a copy of it
  assert.deepEqual(directives['connect-src'], ["'self'", ...MIRROR_HOSTS.map((host) => `https://${host}`)]);
});

test('the other hardening headers are set and the image optimizer is off', async () => {
  const h = await headersFor();
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(nextConfig.poweredByHeader, false);
  assert.deepEqual(nextConfig.images, { unoptimized: true });
});
