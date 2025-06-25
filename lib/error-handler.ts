import { auditLogger } from './enhanced-audit-logger';
import { NextApiRequest, NextApiResponse } from 'next';

export interface ErrorContext {
  userId?: string;
  action?: string;
  resource?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export class ErrorHandler {
  static async handleApiError(
    error: Error,
    req: NextApiRequest,
    res: NextApiResponse,
    context?: ErrorContext
  ): Promise<void> {
    const errorId = this.generateErrorId();
    const ipAddress = this.getClientIP(req);
    
    // Log the error
    await auditLogger.logError(error, context?.action || 'API_ERROR', context?.userId, {
      ...context,
      errorId,
      url: req.url,
      method: req.method,
      ipAddress,
      userAgent: req.headers['user-agent']
    });

    // Determine error response based on error type
    const errorResponse = this.categorizeError(error, errorId);

    // Send response
    res.status(errorResponse.status).json(errorResponse.body);
  }

  static async handleSystemError(error: Error, context?: ErrorContext): Promise<string> {
    const errorId = this.generateErrorId();
    
    await auditLogger.logError(error, context?.action || 'SYSTEM_ERROR', context?.userId, {
      ...context,
      errorId,
      systemError: true
    });

    // Send critical alert for system errors
    if (this.isCriticalError(error)) {
      await auditLogger.logCritical('CRITICAL_SYSTEM_ERROR', {
        errorId,
        error: error.message,
        stack: error.stack,
        context
      }, context?.userId);
    }

    return errorId;
  }

  static categorizeError(error: Error, errorId: string): {
    status: number;
    body: any;
  } {
    // Database errors
    if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
      return {
        status: 409,
        body: {
          error: 'Conflict',
          message: 'Resource already exists',
          errorId,
          type: 'DUPLICATE_RESOURCE'
        }
      };
    }

    // Authentication errors
    if (error.message.includes('JWT') || error.message.includes('token') || error.message.includes('unauthorized')) {
      return {
        status: 401,
        body: {
          error: 'Unauthorized',
          message: 'Authentication required',
          errorId,
          type: 'AUTH_ERROR'
        }
      };
    }

    // Permission errors
    if (error.message.includes('permission') || error.message.includes('forbidden') || error.message.includes('access denied')) {
      return {
        status: 403,
        body: {
          error: 'Forbidden',
          message: 'Insufficient permissions',
          errorId,
          type: 'PERMISSION_ERROR'
        }
      };
    }

    // Validation errors
    if (error.message.includes('validation') || error.message.includes('invalid') || error.message.includes('required')) {
      return {
        status: 400,
        body: {
          error: 'Bad Request',
          message: 'Invalid input data',
          errorId,
          type: 'VALIDATION_ERROR'
        }
      };
    }

    // Rate limit errors
    if (error.message.includes('rate limit') || error.message.includes('too many requests')) {
      return {
        status: 429,
        body: {
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          errorId,
          type: 'RATE_LIMIT_ERROR'
        }
      };
    }

    // Default server error
    return {
      status: 500,
      body: {
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
        errorId,
        type: 'INTERNAL_ERROR'
      }
    };
  }

  static isCriticalError(error: Error): boolean {
    const criticalPatterns = [
      'database connection',
      'out of memory',
      'disk space',
      'security breach',
      'authentication bypass',
      'privilege escalation'
    ];

    return criticalPatterns.some(pattern => 
      error.message.toLowerCase().includes(pattern)
    );
  }

  static getClientIP(req: NextApiRequest): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      (req.headers['cf-connecting-ip'] as string) ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }

  private static generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }
}

// Global error handler for unhandled promises
process.on('unhandledRejection', async (reason: any, promise: Promise<any>) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  await ErrorHandler.handleSystemError(error, {
    action: 'UNHANDLED_REJECTION',
    resource: 'system'
  });
});

// Global error handler for uncaught exceptions
process.on('uncaughtException', async (error: Error) => {
  await ErrorHandler.handleSystemError(error, {
    action: 'UNCAUGHT_EXCEPTION',
    resource: 'system'
  });
  
  // Exit process after logging
  process.exit(1);
});