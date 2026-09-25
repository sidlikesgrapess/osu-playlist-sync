/**
 * Per-instance, in-memory rate limiting.
 *
 * There is no `src/middleware.js` (A1): the limit is checked inside each route handler
 * instead, one call at the top before any upstream work, so a route that forgets to call
 * it is visibly missing a line rather than silently unmatched by a middleware pattern.
 *
 * The store is a module-level `Map`, which means the budget is per warm serverless
 * instance, not global -- a known, accepted weakness (D-11), not a bug to fix here.
 */

const buckets = new Map();

// Past this many live keys, expired windows are swept out before a new one is added, so a
// warm instance seeing many distinct clients does not keep every one of them forever.
const SWEEP_AT = 5000;

function sweepExpired(now) {
  for (const [key, entry] of buckets) {
    if (now - entry.windowStart >= entry.windowMs) buckets.delete(key);
  }
}

/** The first x-forwarded-for hop, then x-real-ip. Never trusts anything else. */
function clientIp(request) {
  const headerValue = (name) => {
    const headers = request?.headers;
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    return headers[name] ?? null;
  };

  const forwardedFor = headerValue('x-forwarded-for');
  if (forwardedFor) {
    const first = String(forwardedFor).split(',')[0].trim();
    if (first) return first;
  }

  const realIp = headerValue('x-real-ip');
  if (realIp) return String(realIp).trim();

  // An IP we could not read is never a free pass -- everyone with no identifying header
  // shares this one bucket, so the limit still bites instead of failing open.
  return 'unknown';
}

/**
 * `bucket` names the route (or other budget) being limited; `limit` requests are allowed
 * per `windowMs`, a fixed window per client per bucket. Returns `{ ok, retryAfterSec }`.
 */
/** Live keys in the store. Exported for tests only. */
export function bucketCount() {
  return buckets.size;
}

export function checkRateLimit(request, { bucket, limit, windowMs }) {
  const ip = clientIp(request);
  const key = `${bucket}:${ip}`;
  const now = Date.now();

  let entry = buckets.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    if (!entry && buckets.size >= SWEEP_AT) sweepExpired(now);
    entry = { windowStart: now, windowMs, count: 0 };
    buckets.set(key, entry);
  }

  entry.count += 1;

  if (entry.count > limit) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.windowStart + windowMs - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** The 429 a route returns when `checkRateLimit` refuses it. */
export function rateLimitResponse(retryAfterSec) {
  return new Response(JSON.stringify({ error: 'Too many requests, try again shortly' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfterSec),
    },
  });
}
