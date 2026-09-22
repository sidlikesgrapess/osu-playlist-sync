import './globals.css';

export const metadata = {
  title: 'osu!Sync: Turn playlists, songs and players into osu! beatmaps',
  description: 'Turn Spotify, YouTube and Apple Music playlists, single songs, or any osu! player\'s top plays and favourites into downloadable beatmaps.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ backgroundColor: '#201f27', color: '#ffffff' }}>
      <body style={{ backgroundColor: '#201f27', color: '#ffffff', minHeight: '100vh', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
