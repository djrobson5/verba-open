import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from 'next-firebase-auth-edge';
import { isAccessAllowed } from '@/config/access';

export async function middleware(request: NextRequest) {
  return authMiddleware(request, {
    loginPath: '/api/login',
    logoutPath: '/api/logout',
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    cookieName: 'AuthToken',
    cookieSignatureKeys: [
      process.env.COOKIE_SECRET_CURRENT!,
      process.env.COOKIE_SECRET_PREVIOUS!,
    ],
    cookieSerializeOptions: {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 12 * 60 * 60 * 24,
    },
    serviceAccount: {
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    },
    handleValidToken: async ({ decodedToken }, headers) => {
      const pathname = request.nextUrl.pathname;

      // Invite-only enforcement: a Firebase Auth user can exist without the
      // admin/allowed claim (see src/config/access.ts). We refuse to mint or
      // honor a session for them.
      if (
        !isAccessAllowed(
          decodedToken as unknown as {
            email?: string;
            admin?: unknown;
            allowed?: unknown;
          },
        )
      ) {
        const url = new URL('/login', request.url);
        url.searchParams.set('reason', 'not-allowed');
        const res = NextResponse.redirect(url);
        res.cookies.delete('AuthToken');
        return res;
      }

      // Redirect authenticated users away from auth pages
      if (pathname === '/login' || pathname === '/signup') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
      return NextResponse.next({ request: { headers } });
    },
    handleInvalidToken: async (_reason) => {
      const pathname = request.nextUrl.pathname;
      // Allow public pages and auth API routes through
      if (
        pathname === '/' ||
        pathname === '/login' ||
        pathname === '/signup' ||
        pathname === '/api/login' ||
        pathname === '/api/logout'
      ) {
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL('/login', request.url));
    },
    handleError: async (error) => {
      console.error('Auth middleware error:', error);
      return NextResponse.redirect(new URL('/login', request.url));
    },
  });
}

export const config = {
  matcher: [
    '/login',
    '/signup',
    '/dashboard/:path*',
    '/language/:path*',
    '/session/:path*',
    '/history/:path*',
    '/admin/:path*',
    '/api/login',
    '/api/logout',
    '/api/gemini-token',
    '/api/openai-live-session',
    '/api/simli-token',
    '/api/liveavatar-token',
    '/api/session-active',
    '/api/session-usage',
    '/api/admin/:path*',
  ],
};
