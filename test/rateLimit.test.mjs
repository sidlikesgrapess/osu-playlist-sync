import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkRateLimit, rateLimitResponse, bucketCount } from '../src/lib/rateLimit.js';

function requestFrom(ip) {
  return { headers: { get: (name) => (name === 'x-forwarded-for' ? ip : null) } };
}

test('exactly `limit` requests pass, and the next one within the window is refused', () => {
  const request = requestFrom('203.0.113.5');
  const opts = { bucket: 'test-limit', limit: 3, windowMs: 60_000 };

  assert.equal(checkRateLimit(request, opts).ok, true);
  assert.equal(checkRateLimit(request, opts).ok, true);
  assert.equal(checkRateLimit(request, opts).ok, true);

  const fourth = checkRateLimit(request, opts);
  assert.equal(fourth.ok, false);
  assert.ok(fourth.retryAfterSec >= 1);
});

test('a different bucket for the same IP has its own independent budget', () => {
  const request = requestFrom('203.0.113.9');
  const a = { bucket: 'bucket-a', limit: 1, windowMs: 60_000 };
  const b = { bucket: 'bucket-b', limit: 1, windowMs: 60_000 };

  assert.equal(checkRateLimit(request, a).ok, true);
  assert.equal(checkRateLimit(request, a).ok, false);
  assert.equal(checkRateLimit(request, b).ok, true);
});

test('a different IP in the same bucket has its own independent budget', () => {
  const opts = { bucket: 'per-ip', limit: 1, windowMs: 60_000 };
  assert.equal(checkRateLimit(requestFrom('198.51.100.1'), opts).ok, true);
  assert.equal(checkRateLimit(requestFrom('198.51.100.2'), opts).ok, true);
});

test('a request with no identifying header shares one "unknown" bucket, and never fails open', () => {
  const bare = { headers: { get: () => null } };
  const opts = { bucket: 'unknown-bucket', limit: 1, windowMs: 60_000 };

  assert.equal(checkRateLimit(bare, opts).ok, true);
  const second = checkRateLimit(bare, opts);
  assert.equal(second.ok, false);
});

test('x-forwarded-for is read as its first hop, and only x-real-ip is a fallback', () => {
  const multiHop = {
    headers: { get: (name) => (name === 'x-forwarded-for' ? '203.0.113.7, 10.0.0.1' : null) },
  };
  const opts = { bucket: 'multi-hop', limit: 1, windowMs: 60_000 };
  assert.equal(checkRateLimit(multiHop, opts).ok, true);

  // The same first hop, reached through a different literal header value, hits the same bucket.
  const sameFirstHop = {
    headers: { get: (name) => (name === 'x-forwarded-for' ? '203.0.113.7,10.0.0.2' : null) },
  };
  assert.equal(checkRateLimit(sameFirstHop, opts).ok, false);
});

test('rateLimitResponse is a 429 carrying Retry-After and a JSON error body', async () => {
  const res = rateLimitResponse(17);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Retry-After'), '17');
  const body = await res.json();
  assert.ok(body.error);
});

test('expired windows are swept once the store is large, so it does not grow without bound', () => {
  const opts = { bucket: 'test-sweep', limit: 1, windowMs: 1 };
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    for (let i = 0; i < 6000; i++) checkRateLimit(requestFrom(`198.51.100.${i}`), opts);
    now += 10;
    checkRateLimit(requestFrom('198.51.100.fresh'), opts);
    assert.ok(bucketCount() < 5000, `store still holds ${bucketCount()} keys`);
  } finally {
    Date.now = realNow;
  }
});
