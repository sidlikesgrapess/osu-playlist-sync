import './globals.css';
import { BOUNCE_BOOT_SCRIPT } from '@/lib/bouncePref';

export const metadata = {
  title: 'osu!Sync: Turn playlists, songs and players into osu! beatmaps',
  description: 'Turn Spotify, YouTube and Apple Music playlists, single songs, or any osu! player\'s top plays and favourites into downloadable beatmaps.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }) {
  // suppressHydrationWarning: the boot script may add `osu-bounce` to <html> before React
  // hydrates, so the server markup and the live class list are allowed to differ there.
  return (
    <html lang="en" suppressHydrationWarning style={{ backgroundColor: '#201f27', color: '#ffffff' }}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOUNCE_BOOT_SCRIPT }} />
      </head>
      <body style={{ backgroundColor: '#201f27', color: '#ffffff', minHeight: '100vh', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
