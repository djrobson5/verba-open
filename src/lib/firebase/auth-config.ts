/**
 * Shared `next-firebase-auth-edge` config for `getTokens()` in API routes.
 *
 * FIREBASE_PRIVATE_KEY is stored with literal `\n` sequences and un-escaped
 * here at read time, same as in middleware.ts.
 */
export function authConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    cookieName: 'AuthToken',
    cookieSignatureKeys: [
      process.env.COOKIE_SECRET_CURRENT!,
      process.env.COOKIE_SECRET_PREVIOUS!,
    ],
    serviceAccount: {
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    },
  };
}
