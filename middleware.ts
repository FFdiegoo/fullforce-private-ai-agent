import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { applyRateLimit, getRateLimitHeaders, createRateLimitError } from './lib/rate-limiter'
import { auditLogger } from './lib/enhanced-audit-logger'

type IPAddress = string;

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}

export async function middleware(req: NextRequest) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const { pathname } = req.nextUrl;

  // Get client IP
  const ip: IPAddress | null = 
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    req.ip ||
    null;

  if (!ip) {
    console.warn('❌ Could not determine client IP');
    return new NextResponse(JSON.stringify({ 
      error: 'Access denied',
      message: 'Unable to verify your IP address',
      timestamp: new Date().toISOString()
    }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // IP Whitelisting (only in production)
  if (!isDevelopment) {
    const allowedIPs: IPAddress[] = [
      '127.0.0.1',
      '::1',
      '2a02:a46e:549e:0:e4c4:26b3:e601:6782',
      '84.86.144.131',
      '185.56.55.239',
      '45.147.87.232',
    ];

    if (process.env.ALLOWED_IPS) {
      const envIPs = process.env.ALLOWED_IPS.split(',').map(ip => ip.trim());
      allowedIPs.push(...envIPs);
    }

    const isAllowed = allowedIPs.some(allowedIP => {
      if (ip === allowedIP) return true;
      if (ip.includes(':') && allowedIP.includes(':')) {
        const normalizeIPv6 = (addr: string) => addr.toLowerCase().replace(/^::ffff:/, '');
        return normalizeIPv6(ip) === normalizeIPv6(allowedIP);
      }
      return false;
    });

    if (!isAllowed) {
      await auditLogger.logSecurity({
        type: 'UNAUTHORIZED_ACCESS',
        severity: 'WARN',
        details: {
          ip,
          pathname,
          userAgent: req.headers.get('user-agent') || 'unknown',
          reason: 'ip_not_whitelisted'
        }
      }, undefined, ip);

      return new NextResponse(JSON.stringify({ 
        error: 'IP restriction',
        message: 'Your IP is not authorized to access this resource',
        ip: ip,
        timestamp: new Date().toISOString()
      }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Rate Limiting
  try {
    let rateLimitType: 'auth' | 'upload' | 'chat' | 'admin' | 'general' = 'general';

    // Determine rate limit type based on path
    if (pathname.startsWith('/api/auth/')) {
      rateLimitType = 'auth';
    } else if (pathname.startsWith('/api/upload') || pathname.includes('upload')) {
      rateLimitType = 'upload';
    } else if (pathname.startsWith('/api/chat') || pathname.includes('chat')) {
      rateLimitType = 'chat';
    } else if (pathname.startsWith('/api/admin/')) {
      rateLimitType = 'admin';
    }

    const rateLimitResult = await applyRateLimit(ip, rateLimitType);

    if (!rateLimitResult.success) {
      await auditLogger.logSecurity({
        type: 'RATE_LIMIT_EXCEEDED',
        severity: 'WARN',
        details: {
          ip,
          pathname,
          rateLimitType,
          totalHits: rateLimitResult.totalHits,
          resetTime: rateLimitResult.resetTime
        }
      }, undefined, ip);

      const errorResponse = createRateLimitError(rateLimitResult);
      const headers = getRateLimitHeaders(rateLimitResult);

      return new NextResponse(JSON.stringify(errorResponse), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      });
    }

    // Add rate limit headers to successful responses
    const response = NextResponse.next();
    const headers = getRateLimitHeaders(rateLimitResult);
    
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Security Headers
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

    return response;

  } catch (error) {
    console.error('❌ Middleware error:', error);
    
    await auditLogger.logError(error as Error, 'MIDDLEWARE_ERROR', undefined, {
      ip,
      pathname,
      userAgent: req.headers.get('user-agent') || 'unknown'
    });

    return NextResponse.next();
  }
}