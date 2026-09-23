/**
 * Beatmap download mirrors, in the order tried.
 *
 * Client-safe: no Node imports, no `fetch` calls of its own -- this module only names
 * mirrors, it never contacts one. `beatmapDownload.js`'s browser-side CORS download path
 * needs that (it runs in the browser bundle), and the server proxy route can share the
 * same data instead of keeping its own separate list.
 *
 * URL shapes and order are taken as-is from what already ships today: `BROWSER_MIRRORS`
 * matches `src/lib/beatmapDownload.js`'s `CORS_MIRRORS` (catboy.best first, then
 * nerinyan.moe); `PROXY_MIRRORS` matches the two still-live entries of
 * `src/app/api/download/route.js`'s proxy list (`direct.sayobot.cn` is confirmed dead
 * there and is not carried forward; sayobot is proxy-only, on `dl.sayobot.cn`).
 *
 * `uaProfile` is `null` on a browser mirror because a page fetch cannot set its own
 * User-Agent header at all -- the browser always sends its own. It is only meaningful on
 * a proxy mirror, which is fetched server-side through `http.js`, where it names a key of
 * `UA_PROFILES` (data, not an import: this module stays dependency-free).
 */

export const BROWSER_MIRRORS = [
  { name: 'catboy.best', url: (id) => `https://catboy.best/d/${id}`, uaProfile: null },
  { name: 'nerinyan.moe', url: (id) => `https://api.nerinyan.moe/d/${id}`, uaProfile: null },
];

export const PROXY_MIRRORS = [
  { name: 'beatconnect', url: (id) => `https://beatconnect.io/b/${id}`, uaProfile: 'server' },
  { name: 'sayobot', url: (id) => `https://dl.sayobot.cn/beatmaps/download/full/${id}`, uaProfile: 'server' },
];

/**
 * Every `BROWSER_MIRRORS` host and its redirect targets, for `next.config.mjs`'s CSP
 * `connect-src` only -- a proxy mirror is fetched from the server, which no CSP governs,
 * so `PROXY_MIRRORS` hosts do not belong here.
 *
 * `api.nerinyan.moe` is known (per the rebuild plan) to redirect to an S3 bucket for the
 * actual file, but no exact bucket hostname is established anywhere in the current code or
 * plan text, and this workstream makes no live request to find out. Guessing it would be
 * worse than leaving it out, so it is omitted; see this workstream's report notes.
 */
export const MIRROR_HOSTS = ['catboy.best', 'api.nerinyan.moe'];

/** The public osu! beatmapset page for a set, used as the last-resort fallback link. */
export const beatmapsetPage = (id) => `https://osu.ppy.sh/beatmapsets/${id}`;
