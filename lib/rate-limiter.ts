interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
  totalHits: number;
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
    firstHit: number;
  };
}

class RateLimiter {
  private store: RateLimitStore = {};
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    
    // Cleanup expired entries every 5 minutes
    if (typeof setInterval !== 'undefined' && typeof window === 'undefined') {
      setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
  }

  // 🔧 FIX: Add public getter for maxRequests
  get maxRequests(): number {
    return this.config.maxRequests;
  }

  async limit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const key = identifier;
    
    // Get or create entry
    let entry = this.store[key];
    
    if (!entry || now > entry.resetTime) {
      // Create new entry or reset expired one
      entry = {
        count: 1,
        resetTime: now + this.config.windowMs,
        firstHit: now
      };
      this.store[key] = entry;
      
      return {
        success: true,
        remaining: this.config.maxRequests - 1,
        resetTime: entry.resetTime,
        totalHits: 1
      };
    }
    
    // Increment counter
    entry.count++;
    
    const remaining = Math.max(0, this.config.maxRequests - entry.count);
    const success = entry.count <= this.config.maxRequests;
    
    return {
      success,
      remaining,
      resetTime: entry.resetTime,
      totalHits: entry.count
    };
  }

  private cleanup(): void {
    const now = Date.now();
    Object.keys(this.store).forEach(key => {
      const entry = this.store[key];
      if (entry && entry.resetTime < now) {
        delete this.store[key];
      }
    });
  }

  getStats(): { totalKeys: number; activeKeys: number } {
    const now = Date.now();
    const activeKeys = Object.keys(this.store).filter(
      key => this.store[key].resetTime > now
    ).length;
    
    return {
      totalKeys: Object.keys(this.store).length,
      activeKeys
    };
  }
}

// Rate limiter instances for different endpoints
export const rateLimiters = {
  auth: new RateLimiter({
    windowMs: parseInt(typeof process !== 'undefined' && process.env ? process.env.RATE_LIMIT_WINDOW_MS || '900000' : '900000'), // 15 minutes
    maxRequests: parseInt(typeof process !== 'undefined' && process.env ? process.env.RATE_LIMIT_AUTH_MAX || '5' : '5')
  }),
  
  upload: new RateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: parseInt(typeof process !== 'undefined' && process.env ? process.env.RATE_LIMIT_UPLOAD_MAX || '10' : '10')
  }),
  
  chat: new RateLimiter({
    windowMs: parseInt(typeof process !== 'undefined' && process.env ? process.env.RATE_LIMIT_WINDOW_MS || '900000' : '900000'), // 15 minutes
    maxRequests: parseInt(typeof process !== 'undefined' && process.env ? process.env.RATE_LIMIT_CHAT_MAX || '50' : '50')
  }),
  
  admin: new RateLimiter({
    windowMs: parseInt(typeof process !== 'undefined' && process.env ? process.env.RATE_LIMIT_WINDOW_MS || '900000' : '900000'), // 15 minutes
    maxRequests: parseInt(typeof process !== 'undefined' && process.env ? process.env.RATE_LIMIT_ADMIN_MAX || '20' : '20')
  }),
  
  general: new RateLimiter({
    windowMs: parseInt(typeof process !== 'undefined' && process.env ? process.env.RATE_LIMIT_WINDOW_MS || '900000' : '900000'), // 15 minutes
    maxRequests: parseInt(typeof process !== 'undefined' && process.env ? process.env.RATE_LIMIT_MAX_REQUESTS || '100' : '100')
  })
};

export async function applyRateLimit(
  identifier: string,
  type: keyof typeof rateLimiters = 'general'
): Promise<RateLimitResult> {
  try {
    return rateLimiters[type].limit(identifier);
  } catch (error) {
    console.error('Rate limiter error:', error);
    // Return success as fallback to prevent blocking
    return {
      success: true,
      remaining: 100,
      resetTime: Date.now() + 900000,
      totalHits: 1
    };
  }
}

export function getRateLimitHeaders(result: RateLimitResult) {
  return {
    // 🔧 FIX: Use public getter instead of private config
    'X-RateLimit-Limit': rateLimiters.general.maxRequests.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
    'X-RateLimit-Used': result.totalHits.toString()
  };
}

export function createRateLimitError(result: RateLimitResult) {
  const resetDate = new Date(result.resetTime);
  return {
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Try again after ${resetDate.toISOString()}`,
    retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
    // 🔧 FIX: Use public getter instead of private config
    limit: rateLimiters.general.maxRequests,
    remaining: result.remaining,
    resetTime: result.resetTime
  };
}