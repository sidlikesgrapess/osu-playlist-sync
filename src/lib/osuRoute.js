/**
 * The one error-to-Response mapper for the osu!-backed routes (A3), plus the demo reply.
 *
 * `osuApiGet` attaches `.status` to what it throws, and `ValidationError` carries 400, so
 * the status is all this needs. The upstream message is logged, never returned: it names
 * the osu! API path, which is none of the caller's business (F-31).
 */
import { NextResponse } from 'next/server';
import { ValidationError } from './validate.js';

export const RATE_LIMITED_MESSAGE = 'osu! is rate limiting us, try again in a minute';

export function toRouteError(error, { notFoundMessage = 'Not found' } = {}) {
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const status = error?.status;
  console.error('[osu! route]', status || '', error?.message || error);

  if (status === 404) {
    return NextResponse.json({ error: notFoundMessage }, { status: 404 });
  }
  if (status === 429) {
    const retryAfter = Number(error?.retryAfter);
    const headers = Number.isFinite(retryAfter) && retryAfter > 0
      ? { 'Retry-After': String(Math.ceil(retryAfter)) }
      : undefined;
    return NextResponse.json({ error: RATE_LIMITED_MESSAGE }, { status: 429, headers });
  }
  return NextResponse.json({ error: 'The osu! API request failed' }, { status: 502 });
}

/** 200 `{ isDemo: true, ...extra }`: no osu! credentials, so the UI shows the setup guide. */
export function demoResponse(extra = {}) {
  return NextResponse.json({ isDemo: true, ...extra });
}
