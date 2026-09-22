import { NextResponse } from 'next/server';

const REPO = 'sidlikesgrapess/osu-playlist-sync';
const COMMIT_COUNT = 5;

// The route itself always runs (otherwise the commit list would freeze at build
// time), but the GitHub call is cached briefly — unauthenticated reads are capped
// at 60/hour per IP, so this can't be fully live without risking that limit.
export const dynamic = 'force-dynamic';
const CACHE_TTL_MS = 120_000;

// Cached here rather than with `next: { revalidate }`, which was serving a
// changelog days out of date. That cache is stale-while-revalidate with no
// ceiling on the staleness: an expired entry is still served, and the refetch it
// kicks off only lands in time for the *next* caller. The modal is opened rarely
// and briefly, so every open saw the previous open's data, however old.
//
// This refetches in the foreground instead, so a stale entry is never handed out.
// The cache is per server instance, not per user, the same shape as the token
// singleton in src/lib/osu.js: whoever opens the modal first pays for the call and
// everyone on that instance rides it.
//
// Two minutes is the whole budget argument. Unauthenticated reads are capped at
// 60/hour per IP and, unlike the authenticated API, a conditional request answered
// 304 is still counted, so an etag would buy nothing. 120s is 30 calls/hour per
// instance, which leaves room for a second warm one.
let cache = { commits: null, fetchedAt: 0 };

/** Splits a conventional-commit subject into its type and human-readable part. */
function parseSubject(message) {
  const subject = String(message || '').split('\n')[0].trim();
  const match = subject.match(/^(\w+)(?:\([^)]*\))?:\s*(.+)$/);

  if (!match) return { type: null, text: subject };
  return { type: match[1].toLowerCase(), text: match[2] };
}

/** The last good list, or an empty one. Used whenever a refetch can't be trusted. */
function fallback() {
  return NextResponse.json({ commits: cache.commits || [] });
}

export async function GET() {
  if (cache.commits && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ commits: cache.commits });
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/commits?per_page=${COMMIT_COUNT}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'osu-playlist-sync',
        },
        // The TTL above is the only cache. Letting Next cache this too would put
        // back the stale-while-revalidate behaviour this route just got rid of.
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      // Rate limited or down. Keep showing the last good list rather than
      // blanking the changelog, and retry on the next request.
      console.warn('[GitHub commits] responded', res.status);
      return fallback();
    }

    const data = await res.json();
    const commits = (Array.isArray(data) ? data : []).map(entry => {
      const { type, text } = parseSubject(entry?.commit?.message);
      return {
        sha: entry.sha?.slice(0, 7),
        type,
        text,
        date: entry?.commit?.author?.date || null,
        url: entry.html_url,
      };
    });

    cache = { commits, fetchedAt: Date.now() };
    return NextResponse.json({ commits });
  } catch (error) {
    console.warn('[GitHub commits] fetch failed:', error?.message || error);
    return fallback();
  }
}
