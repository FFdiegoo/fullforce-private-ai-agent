import { NextApiRequest, NextApiResponse } from 'next';
import { applyEnhancedRateLimit, getEnhancedRateLimitHeaders, createEnhancedRateLimitError } from '../../lib/enhanced-rate-limiter';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || '127.0.0.1';
  
  try {
    // Apply rate limiting (5 requests per 1 minute for testing)
    const rateLimitResult = await applyEnhancedRateLimit(clientIP, 'auth', {
      endpoint: '/api/test-rate-limit',
      method: req.method,
      userAgent: req.headers['user-agent']
    });

    // Add rate limit headers
    const headers = getEnhancedRateLimitHeaders(rateLimitResult, 'auth');
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    if (!rateLimitResult.success) {
      const errorResponse = createEnhancedRateLimitError(rateLimitResult, 'auth');
      return res.status(429).json(errorResponse);
    }

    // Return success response with rate limit info
    return res.status(200).json({
      success: true,
      message: 'Rate limit test successful',
      rateLimit: {
        remaining: rateLimitResult.remaining,
        totalHits: rateLimitResult.totalHits,
        resetTime: new Date(rateLimitResult.resetTime).toISOString(),
        blocked: rateLimitResult.blocked
      },
      clientIP: clientIP.substring(0, 10) + '...',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Rate limit test error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}