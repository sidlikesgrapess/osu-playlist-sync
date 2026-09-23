import { NextResponse } from 'next/server';
import { fetchUpstream } from '@/lib/http';
import { positiveIntId } from '@/lib/validate';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { PROXY_MIRRORS } from '@/lib/mirrors';
import { contentDisposition } from '@/lib/filename';
import { hasZipHead, MAX_PROXY_ARCHIVE_BYTES } from '@/lib/archive';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

/**
 * The server-side fallback for a beatmap the browser could not fetch from a CORS mirror.
 *
 * It walks `PROXY_MIRRORS` only (the browser already tried `BROWSER_MIRRORS`) and relays
 * the first real archive. Everything is bounded:
 *   - one deadline for the whole request, headers and body alike, one second inside
 *     `maxDuration` so the platform can still close the response itself;
 *   - each mirror waits at most `min(remaining, 6 s)` for headers, so a hung first mirror
 *     cannot take all of the time from the next;
 *   - at most `MAX_PROXY_ARCHIVE_BYTES` are relayed, by Content-Length up front and by
 *     counting as the bytes pass.
 * When the cap or the deadline cuts the relay the stream is errored, never closed, so a
 * truncated body is never presented to the client as a complete file. When every mirror
 * fails the answer is a 502: nothing is ever made up in place of a real archive.
 */
const DEADLINE_MS = (maxDuration - 1) * 1000;
const HEADER_WAIT_MS = 6000;
const RATE_LIMIT = { bucket: 'download', limit: 30, windowMs: 60_000 };
const ZIP_HEAD_BYTES = 4;

class MirrorRejected extends Error {}

/** Reads until at least `n` bytes are buffered, or the body ends first. */
async function readAtLeast(reader, n) {
  const chunks = [];
  let total = 0;
  while (total < n) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  return { chunks, total };
}

/** The first `n` bytes across `chunks`, which may each be shorter than `n`. */
function firstBytes(chunks, n) {
  const out = new Uint8Array(n);
  let filled = 0;
  for (const c of chunks) {
    const take = c.subarray(0, n - filled);
    out.set(take, filled);
    filled += take.length;
    if (filled === n) break;
  }
  return filled === n ? out : out.subarray(0, filled);
}

/**
 * Opens one mirror and checks the start of what it sends. Returns the open reader and the
 * chunks already read, or throws so the caller moves on to the next mirror.
 */
async function openMirror(mirror, id, { deadline, signal }) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new MirrorRejected('deadline passed');

  const res = await fetchUpstream(mirror.url(id), {
    profile: mirror.uaProfile || 'server',
    timeoutMs: Math.min(remaining, HEADER_WAIT_MS),
    signal,
  });

  const lengthHeader = res.headers.get('content-length');
  const declared = lengthHeader === null ? null : Number(lengthHeader);
  if (declared !== null && declared > MAX_PROXY_ARCHIVE_BYTES) {
    await res.body?.cancel().catch(() => {});
    throw new MirrorRejected(`declares ${declared} bytes, over the cap`);
  }
  if (!res.body) throw new MirrorRejected('empty body');

  const reader = res.body.getReader();
  const { chunks, total } = await readAtLeast(reader, ZIP_HEAD_BYTES);
  if (!hasZipHead(firstBytes(chunks, ZIP_HEAD_BYTES))) {
    await reader.cancel().catch(() => {});
    throw new MirrorRejected('not a ZIP archive');
  }

  // fetch has already decoded a compressed body, so its encoded length would be wrong here.
  const relayLength = Number.isFinite(declared) && !res.headers.get('content-encoding') ? declared : null;
  return { reader, chunks, total, declared: relayLength };
}

/** The byte-counting relay. On the cap or the deadline it errors the stream, never closes it. */
function relayStream({ reader, chunks, total }, { signal, onDone }) {
  let sent = total;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone();
  };
  const fail = (controller, err) => {
    reader.cancel().catch(() => {});
    controller.error(err);
    finish();
  };

  return new ReadableStream({
    start(controller) {
      if (sent > MAX_PROXY_ARCHIVE_BYTES) {
        fail(controller, new Error('Archive over the proxy byte cap'));
        return;
      }
      for (const c of chunks) controller.enqueue(c);
    },
    async pull(controller) {
      try {
        if (signal.aborted) throw new Error('Proxy deadline reached');
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          finish();
          return;
        }
        sent += value.byteLength;
        if (sent > MAX_PROXY_ARCHIVE_BYTES) throw new Error('Archive over the proxy byte cap');
        controller.enqueue(value);
      } catch (err) {
        fail(controller, signal.aborted ? new Error('Proxy deadline reached') : err);
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => {});
      finish();
    },
  });
}

export async function GET(request) {
  // Both checks run before any mirror is contacted.
  const limited = checkRateLimit(request, RATE_LIMIT);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  let beatmapsetId;
  try {
    beatmapsetId = positiveIntId(new URL(request.url).searchParams.get('beatmapsetId'), { name: 'beatmapsetId' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 400 });
  }

  const deadline = Date.now() + DEADLINE_MS;
  const deadlineController = new AbortController();
  const deadlineTimer = setTimeout(() => deadlineController.abort(), DEADLINE_MS);
  const release = () => clearTimeout(deadlineTimer);

  try {
    for (const mirror of PROXY_MIRRORS) {
      if (deadlineController.signal.aborted) break;

      let opened;
      try {
        opened = await openMirror(mirror, beatmapsetId, { deadline, signal: deadlineController.signal });
      } catch (err) {
        console.warn(`[download] ${mirror.name} skipped for ${beatmapsetId}: ${err.status ?? ''} ${err.message}`);
        continue;
      }

      const headers = {
        'Content-Type': 'application/x-osu-beatmap-archive',
        'Content-Disposition': contentDisposition(`${beatmapsetId}.osz`),
        'X-Selected-Mirror': mirror.name,
      };
      if (opened.declared !== null) headers['Content-Length'] = String(opened.declared);

      const body = relayStream(opened, { signal: deadlineController.signal, onDone: release });
      return new NextResponse(body, { status: 200, headers });
    }

    release();
    return NextResponse.json({ error: 'No mirror could provide this beatmap right now' }, { status: 502 });
  } catch (err) {
    release();
    console.error('[download] proxy failed:', err);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
