interface RateLimitResult {
  success: boolean;
  remaining?: number;
  resetTime?: number;
}

// Simple in-memory rate limiter for demo purposes
// In production, use Redis or similar
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export async function rateLimitByType(
  identifier: string, 
  type: 'auth' | 'api' = 'api',
  limit: number = 10,
  windowMs: number = 60000 // 1 minute
): Promise<RateLimitResult> {
  const key = `${type}:${identifier}`;
  const now = Date.now();
  
  const current = rateLimitStore.get(key);
  
  if (!current || now > current.resetTime) {
    // Reset or create new entry
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs
    });
    
    return {
      success: true,
      remaining: limit - 1,
      resetTime: now + windowMs
    };
  }
  
  if (current.count >= limit) {
    return {
      success: false,
      remaining: 0,
      resetTime: current.resetTime
    };
  }
  
  current.count++;
  rateLimitStore.set(key, current);
  
  return {
    success: true,
    remaining: limit - current.count,
    resetTime: current.resetTime
  };
}