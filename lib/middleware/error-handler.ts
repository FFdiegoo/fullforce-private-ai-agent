// Error handling middleware for API routes
import { NextApiRequest, NextApiResponse } from 'next';
import { AppError, ErrorHandler } from '../utils/errors';
import { auditLogger } from '../utils/audit-logger';
import { Logger } from '../utils/logger';

const logger = new Logger('ErrorHandlerMiddleware');

export function withErrorHandler(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const startTime = Date.now();

    try {
      // Add request ID to request object
      (req as any).requestId = requestId;

      logger.debug('API request started', {
        requestId,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: getClientIP(req)
      });

      await handler(req, res);

      const duration = Date.now() - startTime;
      logger.info('API request completed', {
        requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      const handledError = ErrorHandler.handle(error, `API ${req.method} ${req.url}`);
      
      logger.error('API request failed', {
        requestId,
        method: req.method,
        url: req.url,
        statusCode: handledError.statusCode,
        duration,
        errorCode: handledError.code
      }, handledError);

      // Log to audit system for security-relevant errors
      if (handledError.statusCode === 401 || handledError.statusCode === 403) {
        await auditLogger.logSecurity({
          type: 'UNAUTHORIZED_API_ACCESS',
          severity: 'WARN',
          details: {
            method: req.method,
            url: req.url,
            statusCode: handledError.statusCode,
            errorCode: handledError.code,
            userAgent: req.headers['user-agent'],
            ip: getClientIP(req)
          }
        });
      }

      // Send error response
      const errorResponse = ErrorHandler.getErrorResponse(handledError);
      return res.status(handledError.statusCode).json({
        ...errorResponse,
        requestId
      });
    }
  };
}

// CORS middleware
export function withCORS(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void,
  options: {
    origin?: string | string[];
    methods?: string[];
    allowedHeaders?: string[];
  } = {}
) {
  const {
    origin = process.env.NEXT_PUBLIC_SITE_URL || '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With']
  } = options;

  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', Array.isArray(origin) ? origin.join(',') : origin);
    res.setHeader('Access-Control-Allow-Methods', methods.join(','));
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(','));
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      logger.debug('CORS preflight request handled', {
        origin: req.headers.origin,
        method: req.headers['access-control-request-method']
      });
      return res.status(200).end();
    }

    await handler(req, res);
  };
}

// Security headers middleware
export function withSecurityHeaders(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    await handler(req, res);
  };
}

// Combined middleware for API routes
export function withApiMiddleware<T = any>(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void,
  options: {
    rateLimit?: keyof typeof rateLimiters;
    requireAuth?: boolean;
    requireRole?: 'admin' | 'user';
    cors?: boolean;
  } = {}
) {
  let wrappedHandler = handler;

  // Apply middleware in reverse order (last applied = first executed)
  wrappedHandler = withErrorHandler(wrappedHandler);
  wrappedHandler = withSecurityHeaders(wrappedHandler);
  
  if (options.cors !== false) {
    wrappedHandler = withCORS(wrappedHandler);
  }

  if (options.rateLimit) {
    const { withRateLimit } = require('./rate-limit');
    wrappedHandler = withRateLimit(options.rateLimit)(wrappedHandler);
  }

  if (options.requireRole) {
    const { withRole } = require('./auth');
    wrappedHandler = withRole(options.requireRole)(wrappedHandler);
  } else if (options.requireAuth) {
    const { withAuth } = require('./auth');
    wrappedHandler = withAuth(wrappedHandler);
  }

  return wrappedHandler;
}

function getClientIP(req: NextApiRequest): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    (req.headers['cf-connecting-ip'] as string) ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}