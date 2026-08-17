import './globals.css';
import Providers from '@/components/Providers';

export const metadata = {
  title: 'osu! Playlist Sync — Convert YouTube Playlists to Beatmaps',
  description: 'Convert YouTube playlists directly into playable osu! beatmaps with official osu!web design.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ backgroundColor: '#201f27', color: '#ffffff' }}>
      <body style={{ backgroundColor: '#201f27', color: '#ffffff', minHeight: '100vh', margin: 0 }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
