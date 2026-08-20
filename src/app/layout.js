import './globals.css';
import Providers from '@/components/Providers';

export const metadata = {
  title: 'osu! Sync — Music Playlists to osu! Beatmaps',
  description: 'Convert Spotify, YouTube, and Apple Music playlists directly into playable osu! beatmaps.',
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
