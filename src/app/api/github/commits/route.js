import { fetchJson } from '@/lib/http';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

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

// The memory cache above is per instance; this lets the CDN in front of every instance hold
// a good list too, so the egress IP they share spends even fewer of its 60 an hour. It is
// sent only with a list GitHub actually answered: a fallback served while GitHub is failing,
// and the 429 below, must never be held at the edge for two minutes.
const CDN_CACHE = 's-maxage=120, stale-while-revalidate=300';

const RATE_LIMIT = { bucket: 'githubCommits', limit: 20, windowMs: 60_000 };

/** Splits a conventional-commit subject into its type and human-readable part. */
function parseSubject(message) {
  const subject = String(message || '').split('\n')[0].trim();
  const match = subject.match(/^(\w+)(?:\([^)]*\))?:\s*(.+)$/);

  if (!match) return { type: null, text: subject };
  return { type: match[1].toLowerCase(), text: match[2] };
}

/** The last good list, or an empty one. Used whenever a refetch can't be trusted. */
function fallback() {
  return Response.json({ commits: cache.commits || [] });
}

/** A list GitHub answered, fresh or from the memory cache: the only response the CDN may keep. */
function goodList(commits) {
  return Response.json({ commits }, { headers: { 'Cache-Control': CDN_CACHE } });
}

export async function GET(request) {
  const limited = checkRateLimit(request, RATE_LIMIT);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  if (cache.commits && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return goodList(cache.commits);
  }

  try {
    // http.js always fetches with cache: 'no-store', so the TTL above stays the only
    // server cache. Letting Next cache this too would put back the stale-while-revalidate
    // behaviour this route got rid of.
    let data;
    try {
      data = await fetchJson(`https://api.github.com/repos/${REPO}/commits?per_page=${COMMIT_COUNT}`, {
        profile: 'server',
        headers: { Accept: 'application/vnd.github+json' },
        maxBytes: 500_000,
      });
    } catch (error) {
      // Rate limited or down (http.js tags the status). Keep showing the last good list
      // rather than blanking the changelog, and retry on the next request.
      console.warn('[GitHub commits] fetch failed:', error?.status || error?.message || error);
      return fallback();
    }

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
    return goodList(commits);
  } catch (error) {
    console.warn('[GitHub commits] unreadable response:', error?.message || error);
    return fallback();
  }
}
