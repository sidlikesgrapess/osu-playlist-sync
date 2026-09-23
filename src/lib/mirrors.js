/**
 * Beatmap download mirrors, in the order tried.
 *
 * Client-safe: no Node imports, no `fetch` calls of its own -- this module only names
 * mirrors, it never contacts one. `beatmapDownload.js`'s browser-side CORS download path
 * needs that (it runs in the browser bundle), and the server proxy route can share the
 * same data instead of keeping its own separate list.
 *
 * `BROWSER_MIRRORS` are fetched straight from the page by `beatmapDownload.js` (catboy.best
 * first, then nerinyan.moe). `PROXY_MIRRORS` are only reached through `/api/download`, the
 * last resort when both browser mirrors fail. `direct.sayobot.cn` is dead and not listed.
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

/**
 * Settled by one server-profile HEAD each on set 41823 (2026-09-24, `redirect: 'manual'`):
 *   - beatconnect `/b/{id}`: 301 to `/b/{id}/` on the same host, no ACAO. Proxy-only.
 *   - sayobot `/beatmaps/download/novideo/{id}` and `/full/{id}` both answer 302 to
 *     `https://tc1.sayobot.cn:25225/...` with ACAO `*`. The target is https, so following
 *     it from the server is never an https to http downgrade. `novideo` answers exactly
 *     like `full` and moves fewer bytes through the function, so it is the one used.
 * Neither refused the server profile, so both keep it.
 */
export const PROXY_MIRRORS = [
  { name: 'beatconnect', url: (id) => `https://beatconnect.io/b/${id}`, uaProfile: 'server' },
  { name: 'sayobot', url: (id) => `https://dl.sayobot.cn/beatmaps/download/novideo/${id}`, uaProfile: 'server' },
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
