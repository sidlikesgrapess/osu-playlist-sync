import { MIRROR_HOSTS } from './src/lib/mirrors.js';

// Every origin the browser itself loads from, as data. Anything not listed is what the
// Report-Only policy below exists to find: it logs a violation and blocks nothing.
const CSP_SOURCES = {
  // /osuLogo.png, /grades/*.svg and the favicon, then beatmap covers, osu! avatars, and
  // the YouTube, Spotify and Apple artwork a song row shows as its thumbnail.
  'img-src': [
    "'self'",
    'https://assets.ppy.sh',
    'https://a.ppy.sh',
    'https://i.ytimg.com',
    'https://lh3.googleusercontent.com',
    'https://i.scdn.co',
    'https://*.mzstatic.com',
  ],
  // beatmap audio previews
  'media-src': ['https://b.ppy.sh'],
  // the app's own /api routes, and the mirrors the browser downloads from directly
  'connect-src': ["'self'", ...MIRROR_HOSTS.map((host) => `https://${host}`)],
  'frame-ancestors': ["'none'"],
};

const contentSecurityPolicy = Object.entries(CSP_SOURCES)
  .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
  .join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // No remote image optimization: nothing renders next/image, and an open /_next/image
  // endpoint would fetch and resize remote images for anyone who asks.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Report-Only until the client-ui preview has downloaded once from each browser
          // mirror and any host it reports has been added to mirrors.js (plan 2.4).
          { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
