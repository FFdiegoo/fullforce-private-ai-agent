import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { EnhancedSessionManager } from './lib/enhanced-session-manager';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/diego-login',
  '/emergency-access'
];

const ADMIN_PATHS = ['/admin'];

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Skip middleware for API routes, static files, and public paths
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    PUBLIC_PATHS.includes(pathname)
  ) {
    return NextResponse.next();
  }

  try {
    // --- IP Whitelisting (only in production) ---
    if (!isDevelopment) {
      const ip = getClientIP(request);
      if (!ip) {
        return forbiddenResponse('Unable to verify your IP address');
      }

      const allowedIPs = [
        '127.0.0.1',
        '::1',
        '2a02:a46e:549e:0:e4c4:26b3:e601:6782',
        '84.86.144.131',
        '185.56.55.239',
        '45.147.87.232',
        // Add more from env
        ...(process.env.ALLOWED_IPS?.split(',').map(ip => ip.trim()) || [])
      ];

      if (!isIPAllowed(ip, allowedIPs)) {
        return forbiddenResponse(`Your IP (${ip}) is not authorized to access this resource`);
      }
    }

    // --- Rate Limiting ---
    try {
      const ip = getClientIP(request);
      const rateLimitType = getRateLimitType(pathname);
      const rateLimitResult = await applyRateLimit(ip, rateLimitType);

      if (!rateLimitResult.success) {
        return rateLimitExceededResponse(rateLimitResult);
      }
    } catch (rateLimitError) {
      console.error('Rate limiting error:', rateLimitError);
      // Continue without rate limiting if it fails
    }

    // --- Session Validation ---
    const session = await EnhancedSessionManager.validateSessionFromRequest(request);

    if (!session) {
      // Redirect to login if no valid session
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // --- Optional: Admin path check ---
    if (pathname.startsWith('/admin')) {
      // TODO: Add admin role/permission check if needed
    }

    // --- Build response with session info and security headers ---
    const response = NextResponse.next();
    response.headers.set('x-user-id', session.userId);
    response.headers.set('x-user-email', session.email);

    addSecurityHeaders(response);

    return response;

  } catch (error) {
    console.error('Middleware error:', error);
    return new NextResponse(JSON.stringify({
      error: 'Internal server error',
      message: 'Middleware encountered an error',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// --- Helper functions ---

function getClientIP(req: NextRequest): string | null {
  return (
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    req.ip ||
    null
  );
}

function isIPAllowed(ip: string, allowedIPs: string[]): boolean {
  if (allowedIPs.includes(ip)) return true;

  // Normalize IPv6 addresses for comparison
  if (ip.includes(':')) {
    const normalizeIPv6 = (addr: string) => addr.toLowerCase().replace(/^::ffff:/, '');
    return allowedIPs.some(allowedIP => normalizeIPv6(allowedIP) === normalizeIPv6(ip));
  }

  return false;
}

function forbiddenResponse(message: string) {
  return new NextResponse(JSON.stringify({
    error: 'Access denied',
    message,
    timestamp: new Date().toISOString()
  }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  });
}

function getRateLimitType(pathname: string): 'auth' | 'upload' | 'chat' | 'admin' | 'general' {
  if (pathname.startsWith('/api/auth/')) return 'auth';
  if (pathname.startsWith('/api/upload') || pathname.includes('upload')) return 'upload';
  if (pathname.startsWith('/api/chat') || pathname.includes('chat')) return 'chat';
  if (pathname.startsWith('/api/admin/')) return 'admin';
  return 'general';
}

async function applyRateLimit(ip: string | null, type: string) {
  // TODO: Replace with your real rate limiting logic
  // For now, simple in-memory or always allow
  return {
    success: true,
    remaining: 100,
    resetTime: Date.now() + 900000,
    totalHits: 1
  };
}

function rateLimitExceededResponse(result: any) {
  const resetDate = new Date(result.resetTime);
  return new NextResponse(JSON.stringify({
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Try again after ${resetDate.toISOString()}`,
    retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
    limit: 100,
    remaining: result.remaining,
    resetTime: result.resetTime
  }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': '100',
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
      'X-RateLimit-Used': result.totalHits.toString()
    }
  });
}

function addSecurityHeaders(response: NextResponse) {
  if (process.env.CSP_ENABLED === 'true') {
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.openai.com https://*.supabase.co wss://*.supabase.co;"
    );
  }

  if (process.env.HSTS_ENABLED === 'true') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}