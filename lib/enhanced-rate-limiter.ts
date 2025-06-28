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
  blocked: boolean;
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
    firstHit: number;
    blocked: boolean;
  };
}

class EnhancedRateLimiter {
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

  get maxRequests(): number {
    return this.config.maxRequests;
  }

  async limit(identifier: string, metadata?: any): Promise<RateLimitResult> {
    const now = Date.now();
    const key = identifier;
    
    // Get or create entry
    let entry = this.store[key];
    
    if (!entry || now > entry.resetTime) {
      // Create new entry or reset expired one
      entry = {
        count: 1,
        resetTime: now + this.config.windowMs,
        firstHit: now,
        blocked: false
      };
      this.store[key] = entry;
      
      // Log first request in window
      this.logRateLimit('FIRST_REQUEST', identifier, {
        window: this.config.windowMs,
        maxRequests: this.config.maxRequests,
        metadata
      });
      
      return {
        success: true,
        remaining: this.config.maxRequests - 1,
        resetTime: entry.resetTime,
        totalHits: 1,
        blocked: false
      };
    }
    
    // Increment counter
    entry.count++;
    
    const remaining = Math.max(0, this.config.maxRequests - entry.count);
    const success = entry.count <= this.config.maxRequests;
    
    // Check if this request should be blocked
    if (!success && !entry.blocked) {
      entry.blocked = true;
      
      // Log rate limit exceeded
      this.logRateLimit('RATE_LIMIT_EXCEEDED', identifier, {
        totalHits: entry.count,
        maxRequests: this.config.maxRequests,
        windowMs: this.config.windowMs,
        resetTime: entry.resetTime,
        metadata
      });
    }
    
    return {
      success,
      remaining,
      resetTime: entry.resetTime,
      totalHits: entry.count,
      blocked: entry.blocked
    };
  }

  private logRateLimit(action: string, identifier: string, details: any): void {
    console.log(`🚦 [${this.name}] ${action}:`, {
      identifier: identifier.substring(0, 10) + '...',
      limiter: this.name,
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    Object.keys(this.store).forEach(key => {
      if (this.store[key].resetTime < now) {
        delete this.store[key];
        cleanedCount++;
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`🧹 [${this.name}] Cleaned up ${cleanedCount} expired entries`);
    }
  }

  getStats(): { 
    totalKeys: number; 
    activeKeys: number; 
    blockedKeys: number;
    averageHitsPerKey: number;
  } {
    const now = Date.now();
    const activeEntries = Object.values(this.store).filter(
      entry => entry.resetTime > now
    );
    const blockedEntries = activeEntries.filter(entry => entry.blocked);
    const totalHits = activeEntries.reduce((sum, entry) => sum + entry.count, 0);
    
    return {
      totalKeys: Object.keys(this.store).length,
      activeKeys: activeEntries.length,
      blockedKeys: blockedEntries.length,
      averageHitsPerKey: activeEntries.length > 0 ? Math.round(totalHits / activeEntries.length) : 0
    };
  }
}

// Enhanced rate limiter instances with logging
export const enhancedRateLimiters = {
  auth: new EnhancedRateLimiter('AUTH', {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '5')
  }),
  
  upload: new EnhancedRateLimiter('UPLOAD', {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: parseInt(process.env.RATE_LIMIT_UPLOAD_MAX || '10')
  }),
  
  chat: new EnhancedRateLimiter('CHAT', {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_CHAT_MAX || '50')
  }),
  
  admin: new EnhancedRateLimiter('ADMIN', {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_ADMIN_MAX || '20')
  }),
  
  general: new EnhancedRateLimiter('GENERAL', {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
  })
};

export async function applyEnhancedRateLimit(
  identifier: string,
  type: keyof typeof enhancedRateLimiters = 'general',
  metadata?: any
): Promise<RateLimitResult> {
  try {
    const result = await enhancedRateLimiters[type].limit(identifier, metadata);
    
    // Additional logging for blocked requests
    if (result.blocked) {
      console.warn(`🚫 Rate limit blocked: ${type} for ${identifier.substring(0, 10)}...`);
    }
    
    return result;
  } catch (error) {
    console.error('Rate limiter error:', error);
    // Return success as fallback to prevent blocking
    return {
      success: true,
      remaining: 100,
      resetTime: Date.now() + 900000,
      totalHits: 1,
      blocked: false
    };
  }
}

export function getEnhancedRateLimitHeaders(result: RateLimitResult, limiterType: keyof typeof enhancedRateLimiters = 'general') {
  return {
    'X-RateLimit-Limit': enhancedRateLimiters[limiterType].maxRequests.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
    'X-RateLimit-Used': result.totalHits.toString(),
    'X-RateLimit-Blocked': result.blocked.toString()
  };
}

export function createEnhancedRateLimitError(result: RateLimitResult, limiterType: keyof typeof enhancedRateLimiters = 'general') {
  const resetDate = new Date(result.resetTime);
  return {
    error: 'Too Many Requests',
    message: `Rate limit exceeded for ${limiterType}. Try again after ${resetDate.toISOString()}`,
    retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
    limit: enhancedRateLimiters[limiterType].maxRequests,
    remaining: result.remaining,
    resetTime: result.resetTime,
    blocked: result.blocked,
    type: 'RATE_LIMIT_ERROR'
  };
}

// Export stats function
export function getAllRateLimitStats() {
  const stats: any = {};
  
  Object.entries(enhancedRateLimiters).forEach(([name, limiter]) => {
    stats[name] = limiter.getStats();
  });
  
  return stats;
}