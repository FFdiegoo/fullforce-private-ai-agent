// Enhanced rate limiting middleware
import { NextApiRequest, NextApiResponse } from 'next';
import { RateLimitError } from '../utils/errors';
import { Logger } from '../utils/logger';
import { RATE_LIMITS } from '../constants';

const logger = new Logger('RateLimitMiddleware');

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
    firstHit: number;
  };
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: NextApiRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

class RateLimiter {
  private store: RateLimitStore = {};
  private config: RateLimitConfig;
  private name: string;

  constructor(name: string, config: RateLimitConfig) {
    this.name = name;
    this.config = config;
    
    // Cleanup expired entries every 5 minutes
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
  }

  async limit(identifier: string): Promise<{
    success: boolean;
    remaining: number;
    resetTime: number;
    totalHits: number;
  }> {
    const now = Date.now();
    const key = identifier;
    
    let entry = this.store[key];
    
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 1,
        resetTime: now + this.config.windowMs,
        firstHit: now
      };
      this.store[key] = entry;
      
      logger.debug(`Rate limit: First request in window`, {
        limiter: this.name,
        identifier: identifier.substring(0, 10) + '...',
        windowMs: this.config.windowMs,
        maxRequests: this.config.maxRequests
      });
      
      return {
        success: true,
        remaining: this.config.maxRequests - 1,
        resetTime: entry.resetTime,
        totalHits: 1
      };
    }
    
    entry.count++;
    const remaining = Math.max(0, this.config.maxRequests - entry.count);
    const success = entry.count <= this.config.maxRequests;
    
    if (!success) {
      logger.warn(`Rate limit exceeded`, {
        limiter: this.name,
        identifier: identifier.substring(0, 10) + '...',
        totalHits: entry.count,
        maxRequests: this.config.maxRequests,
        resetTime: new Date(entry.resetTime).toISOString()
      });
    }
    
    return {
      success,
      remaining,
      resetTime: entry.resetTime,
      totalHits: entry.count
    };
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    Object.keys(this.store).forEach(key => {
      if (this.store[key].resetTime < now) {
        delete this.store[key];
        cleaned++;
      }
    });
    
    if (cleaned > 0) {
      logger.debug(`Rate limiter cleanup`, {
        limiter: this.name,
        cleaned,
        remaining: Object.keys(this.store).length
      });
    }
  }

  getStats() {
    const now = Date.now();
    const activeEntries = Object.values(this.store).filter(entry => entry.resetTime > now);
    const blockedEntries = activeEntries.filter(entry => entry.count > this.config.maxRequests);
    
    return {
      name: this.name,
      totalKeys: Object.keys(this.store).length,
      activeKeys: activeEntries.length,
      blockedKeys: blockedEntries.length,
      config: {
        windowMs: this.config.windowMs,
        maxRequests: this.config.maxRequests
      }
    };
  }
}

// Rate limiter instances
export const rateLimiters = {
  auth: new RateLimiter('auth', RATE_LIMITS.auth),
  upload: new RateLimiter('upload', RATE_LIMITS.upload),
  chat: new RateLimiter('chat', RATE_LIMITS.chat),
  admin: new RateLimiter('admin', RATE_LIMITS.admin),
  general: new RateLimiter('general', RATE_LIMITS.general)
};

// Rate limiting middleware
export function withRateLimit(limiterType: keyof typeof rateLimiters = 'general') {
  return function rateLimitMiddleware(
    handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void
  ) {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      try {
        const identifier = getClientIdentifier(req);
        const limiter = rateLimiters[limiterType];
        
        const result = await limiter.limit(identifier);
        
        // Add rate limit headers
        res.setHeader('X-RateLimit-Limit', limiter.getStats().config.maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
        res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());
        res.setHeader('X-RateLimit-Used', result.totalHits.toString());

        if (!result.success) {
          const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
          res.setHeader('Retry-After', retryAfter.toString());
          
          throw new RateLimitError(retryAfter);
        }

        await handler(req, res);

      } catch (error) {
        if (error instanceof RateLimitError) {
          return res.status(error.statusCode).json({
            success: false,
            error: error.message,
            code: error.code,
            retryAfter: error.retryAfter,
            timestamp: error.timestamp
          });
        }

        throw error; // Re-throw non-rate-limit errors
      }
    };
  };
}

function getClientIdentifier(req: NextApiRequest): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    (req.headers['cf-connecting-ip'] as string) ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// Export rate limit stats for monitoring
export function getRateLimitStats() {
  const stats: Record<string, any> = {};
  
  Object.entries(rateLimiters).forEach(([name, limiter]) => {
    stats[name] = limiter.getStats();
  });
  
  return stats;
}