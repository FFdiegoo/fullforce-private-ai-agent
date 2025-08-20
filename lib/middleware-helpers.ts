import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { EnhancedSessionManager } from './enhanced-session-manager';
import { getAllowedIPs } from './ip/allowedIPs';
import {
  applyEnhancedRateLimit,
  getEnhancedRateLimitHeaders,
  createEnhancedRateLimitError
} from './enhanced-rate-limiter';

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
      const allowedIPs = getAllowedIPs();

      if (!isIPAllowed(ip, allowedIPs)) {
        return forbiddenResponse(`Your IP (${ip}) is not authorized to access this resource`);
      }
    }

    // --- Rate Limiting ---
    try {
      const ip = getClientIP(request);
      const rateLimitType = getRateLimitType(pathname);
      const rateLimitResult = await applyEnhancedRateLimit(ip, rateLimitType);

      if (!rateLimitResult.success) {
        return rateLimitExceededResponse(rateLimitResult, rateLimitType);
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

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    '127.0.0.1' // Fallback IP
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

function rateLimitExceededResponse(result: any, limiterType: string) {
  const errorBody = createEnhancedRateLimitError(result, limiterType as any);
  const headers = getEnhancedRateLimitHeaders(result, limiterType as any);
  return new NextResponse(JSON.stringify(errorBody), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      ...headers
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

// Device info extractor voor API-routes (zoals login-2fa)
import type { NextApiRequest } from 'next';

export function extractDeviceInfo(req: NextApiRequest) {
  const deviceIdHeader = req.headers['x-device-id'];
  const deviceId = Array.isArray(deviceIdHeader) ? deviceIdHeader[0] : (deviceIdHeader || 'unknown');

  return {
    userAgent: req.headers['user-agent'] || 'unknown',
    ipAddress:
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown',
    deviceId
  };
}

// Simuleer ophalen van gebruikersrol en permissies
export async function getUserRole(userId: string): Promise<{ role: string; permissions: string[] }> {
  // TODO: Vervang dit met echte database- of API-call
  // Bijvoorbeeld: haal rol op uit Supabase of een andere DB

  // Voorbeeld hardcoded:
  if (userId === 'admin-user-id') {
    return { role: 'admin', permissions: ['read', 'write', 'delete'] };
  }

  return { role: 'user', permissions: ['read'] };
}