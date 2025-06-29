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
    windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    keyGenerator = (req) => req.ip || 'anonymous'
  } = options;

  const key = keyGenerator(request);
  const now = Date.now();
  const resetTime = now + windowMs;

  try {
    // Check if Redis is enabled and available
    if (process.env.REDIS_ENABLED === 'true') {
      // Try Redis implementation
      try {
        const { Redis } = await import('ioredis');
        const redis = new Redis(process.env.REDIS_URL || 'redis://');
        
        const current = await redis.incr(key);
        if (current === 1) {
          await redis.expire(key, Math.ceil(windowMs / 1000));
        }
        
        const ttl = await redis.ttl(key);
        const reset = new Date(now + (ttl * 1000));
        
        return {
          success: current <= maxRequests,
          limit: maxRequests,
          remaining: Math.max(0, maxRequests - current),
          reset
        };
      } catch (redisError) {
        console.warn('Redis not available, falling back to memory store:', redisError);
      }
    }

    // Fallback to in-memory store
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
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of memoryStore.entries()) {
      if (now > value.resetTime) {
        memoryStore.delete(key);
      }
    }
  }, 60000); // Clean up every minute
}