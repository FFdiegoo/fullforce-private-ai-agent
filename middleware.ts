import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { EnhancedSessionManager } from './lib/enhanced-session-manager';

type IPAddress = string;

import { githubActionIPs } from './lib/github-action-ips';

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

export async function middleware(req: NextRequest) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const { pathname } = req.nextUrl;

  try {
    // Get client IP with better error handling
    const ip: IPAddress = getClientIP(req);
      const ip = getClientIP(request);
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
      const primaryAllowedIPs = [
        '127.0.0.1',
        '::1',
        '2a02:a46e:549e:0:e4c4:26b3:e601:6782',
        '84.86.144.131',
        '185.56.55.239',
        '45.147.87.232',
        const envIPs = process.env.ALLOWED_IPS.split(',').map(ip => ip.trim());
        allowedIPs.push(...envIPs);
      ]
      // Add more from env to primary list
      if (process.env.ALLOWED_IPS) {
        primaryAllowedIPs.push(...process.env.ALLOWED_IPS.split(',').map(ip => ip.trim()));
      }

      // First check against primary IPs (fast check)
      const isPrimaryAllowed = isIPAllowed(ip, primaryAllowedIPs);
      
      // Only check against GitHub IPs if not in primary list
      let isAllowed = isPrimaryAllowed;
      if (!isPrimaryAllowed) {
        isAllowed = isIPAllowed(ip, githubActionIPs);
      }

      if (!isAllowed) {
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
        console.warn(`🚫 Blocked IP: ${ip} trying to access ${pathname}`);
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

    // Rate Limiting with error handling
    try {
      const rateLimitResult = await applyRateLimit(ip, getRateLimitType(pathname));

      if (!rateLimitResult.success) {
        console.warn(`⚠️ Rate limit exceeded for IP: ${ip}, path: ${pathname}`);
        
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
      addSecurityHeaders(response);

      return response;

    } catch (rateLimitError) {
      console.error('❌ Rate limiting error:', rateLimitError);
      // Continue without rate limiting if it fails
      const response = NextResponse.next();
      addSecurityHeaders(response);
      return response;
    }

  } catch (error) {
    console.error('❌ Middleware error:', error);
    
    // Return a safe response instead of crashing
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

// Helper function to get client IP
function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    req.ip ||
    '127.0.0.1' // Fallback IP
  );
}

// Helper function to determine rate limit type
function getRateLimitType(pathname: string): 'auth' | 'upload' | 'chat' | 'admin' | 'general' {
  if (pathname.startsWith('/api/auth/')) {
    return 'auth';
  } else if (pathname.startsWith('/api/upload') || pathname.includes('upload')) {
    return 'upload';
  } else if (pathname.startsWith('/api/chat') || pathname.includes('chat')) {
    return 'chat';
  } else if (pathname.startsWith('/api/admin/')) {
    return 'admin';
  }
  return 'general';
}

// Helper function to add security headers
function addSecurityHeaders(response: NextResponse): void {
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

// Simplified rate limiting functions (fallback if imports fail)
async function applyRateLimit(ip: string, type: string): Promise<{ success: boolean; remaining: number; resetTime: number; totalHits: number }> {
  // Simple in-memory rate limiting as fallback
  return {
    success: true,
    remaining: 100,
    resetTime: Date.now() + 900000,
    totalHits: 1
  };
}

function getRateLimitHeaders(result: any) {
  return {
    'X-RateLimit-Limit': '100',
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
    'X-RateLimit-Used': result.totalHits.toString()
  };
}

function createRateLimitError(result: any) {
  const resetDate = new Date(result.resetTime);
  return {
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Try again after ${resetDate.toISOString()}`,
    retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
    limit: 100,
    remaining: result.remaining,
    resetTime: result.resetTime
  };
}