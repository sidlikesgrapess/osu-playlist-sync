import GoogleProvider from 'next-auth/providers/google';

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || 'demo_google_id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'demo_google_secret',
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),
    // Custom osu! OAuth Provider (Optional for user linking)
    {
      id: 'osu',
      name: 'osu!',
      type: 'oauth',
      authorization: {
        url: 'https://osu.ppy.sh/oauth/authorize',
        params: {
          scope: 'identify public',
          response_type: 'code',
        },
      },
      token: 'https://osu.ppy.sh/oauth/token',
      userinfo: 'https://osu.ppy.sh/api/v2/me',
      clientId: process.env.OSU_CLIENT_ID,
      clientSecret: process.env.OSU_CLIENT_SECRET,
      profile(profile) {
        return {
          id: profile.id,
          name: profile.username,
          email: `${profile.id}@osu.ppy.sh`,
          image: profile.avatar_url,
          country: profile.country_code,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.provider = token.provider;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'fallback_secret_for_local_development_only',
  pages: {
    signIn: '/',
  },
};
