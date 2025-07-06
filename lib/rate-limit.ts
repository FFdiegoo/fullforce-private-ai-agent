import { NextRequest } from 'next/server';

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
}

// In-memory store for development/fallback
const memoryStore = new Map<string, { count: number; resetTime: number }>();

export async function rateLimit(
  request: NextRequest,
  options: {
    windowMs?: number;
    maxRequests?: number;
    keyGenerator?: (req: NextRequest) => string;
  } = {}
): Promise<RateLimitResult> {
  const {
    windowMs = parseInt(typeof process !== 'undefined' && process.env ? process.env.RATE_LIMIT_WINDOW_MS || '900000' : '900000'),
    maxRequests = parseInt(typeof process !== 'undefined' && process.env ? process.env.RATE_LIMIT_MAX_REQUESTS || '100' : '100'),
    keyGenerator = (req) => 
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip')?.trim() ||
      req.headers.get('cf-connecting-ip')?.trim() ||
      'anonymous'
  } = options;

  const key = keyGenerator(request);
  const now = Date.now();
  const resetTime = now + windowMs;

  try {
    // Always use in-memory store (no Redis dependency)
    const existing = memoryStore.get(key);
    
    if (!existing || now > existing.resetTime) {
      memoryStore.set(key, { count: 1, resetTime });
      return {
        success: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
        reset: new Date(resetTime)
      };
    }

    existing.count++;
    memoryStore.set(key, existing);

    return {
      success: existing.count <= maxRequests,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - existing.count),
      reset: new Date(existing.resetTime)
    };

  } catch (error) {
    console.error('Rate limiting error:', error);
    // On error, allow the request
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests,
      reset: new Date(resetTime)
    };
  }
}

// Cleanup old entries periodically
if (typeof setInterval !== 'undefined' && typeof window === 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of memoryStore.entries()) {
      if (now > value.resetTime) {
        memoryStore.delete(key);
      }
    }
  }, 60000); // Clean up every minute
}