/**
 * Classifies a pasted playlist/track input into a provider, replacing three separate
 * substring checks that were the F-02 SSRF hole: `extractors.js:177,188,199` decided
 * "this is an Apple Music link" with `trimmed.includes('music.apple.com')`, which also
 * matches `https://example.com/?x=music.apple.com` and `music.apple.com.evil.com`.
 * Client-safe: `PlaylistInput.js`'s `detectPlatform` (`:147-158`) uses this too, so it
 * must never import a Node-only module.
 */

export const PLATFORM_HOSTS = {
  spotify: ['open.spotify.com'],
  apple: ['music.apple.com'],
  youtube: ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'],
  player: ['osu.ppy.sh'],
};

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

const ALL_HOSTS = Object.values(PLATFORM_HOSTS).flat();

/** Lowercases and strips one trailing dot -- "music.apple.com." is the same host. */
function normalizeHost(host) {
  const lower = String(host || '').toLowerCase();
  return lower.endsWith('.') ? lower.slice(0, -1) : lower;
}

function hostToKind(host) {
  for (const [kind, hosts] of Object.entries(PLATFORM_HOSTS)) {
    if (hosts.includes(host)) return kind;
  }
  return null;
}

/**
 * `{ kind: 'spotify'|'apple'|'youtube'|'player'|'query'|'invalid', url?, query? }`.
 *
 * An input is URL-shaped only when it matches a real URL scheme (`proto://...`), or when
 * it *starts* with a known host immediately followed by `/` (so a bare paste like
 * "osu.ppy.sh/users/2" still works). That second rule is a prefix check, not a substring
 * one -- "music.apple.com.evil.com" does not start with "music.apple.com/", so it is never
 * mistaken for a link and falls through to `query` like any other text.
 *
 * A URL-shaped input is classified strictly from its own normalized host, never from
 * anything elsewhere in the string (a query param, a path segment). Only `https` is
 * accepted; anything URL-shaped that isn't on the host list, or isn't `https`, is
 * `invalid` rather than silently treated as a query -- the caller asked for a link and
 * typo'd or spoofed it, so a 400 says so instead of guessing.
 */
export function classifyInput(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { kind: 'invalid' };

  let candidate = trimmed;
  let urlShaped = SCHEME_RE.test(trimmed);

  if (!urlShaped && ALL_HOSTS.some((host) => trimmed.startsWith(`${host}/`))) {
    candidate = `https://${trimmed}`;
    urlShaped = true;
  }

  if (!urlShaped) {
    return { kind: 'query', query: trimmed };
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return { kind: 'invalid' };
  }

  if (parsed.protocol !== 'https:') {
    return { kind: 'invalid' };
  }

  const kind = hostToKind(normalizeHost(parsed.hostname));
  if (!kind) return { kind: 'invalid' };

  if (kind === 'player' && !(parsed.pathname.startsWith('/users/') || parsed.pathname.startsWith('/u/'))) {
    return { kind: 'invalid' };
  }

  return { kind, url: parsed.toString() };
}

/**
 * The canonical provider URL for an id already known to belong to `kind` -- never built
 * from raw caller text (that is the whole point of F-02). `id` carries whatever the
 * provider's own path needs after the host: a bare video id for YouTube or a bare user id
 * for the osu! player, and the entity path (e.g. "playlist/37i9dQ...") for Spotify/Apple,
 * since those two host both tracks and collections under different path segments.
 */
export function buildProviderUrl(kind, id) {
  switch (kind) {
    case 'spotify':
      return `https://open.spotify.com/${id}`;
    case 'apple':
      return `https://music.apple.com/${id}`;
    case 'youtube':
      return `https://www.youtube.com/watch?v=${id}`;
    case 'player':
      return `https://osu.ppy.sh/users/${id}`;
    default:
      throw new Error(`buildProviderUrl: unknown platform kind ${JSON.stringify(kind)}`);
  }
}
