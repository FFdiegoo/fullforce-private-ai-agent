// Centralized error handling utilities
import { Logger } from './logger';

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly timestamp: string;

  constructor(
    message: string,
    code: string = 'INTERNAL_ERROR',
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400);
    if (details) {
      this.message = `${message}: ${JSON.stringify(details)}`;
    }
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND_ERROR', 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super(message, 'CONFLICT_ERROR', 409);
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter: number = 60) {
    super('Rate limit exceeded', 'RATE_LIMIT_ERROR', 429);
    this.retryAfter = retryAfter;
  }
}

export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(service: string, message: string) {
    super(`${service} service error: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502);
    this.service = service;
  }
}

// Error handler utility
export class ErrorHandler {
  private static logger = new Logger('ErrorHandler');

  static handle(error: unknown, context: string = 'Unknown'): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      this.logger.error(`Unhandled error in ${context}`, {}, error);
      return new AppError(
        error.message,
        'UNHANDLED_ERROR',
        500,
        false
      );
    }

    this.logger.error(`Unknown error in ${context}`, { error });
    return new AppError(
      'An unexpected error occurred',
      'UNKNOWN_ERROR',
      500,
      false
    );
  }

  static isOperational(error: Error): boolean {
    if (error instanceof AppError) {
      return error.isOperational;
    }
    return false;
  }

  static getErrorResponse(error: AppError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
      timestamp: error.timestamp,
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack
      })
    };
  }

  static logError(error: Error, context: string, metadata?: Record<string, any>): void {
    this.logger.error(`Error in ${context}`, metadata, error);
  }
}

// Global error handlers
if (typeof process !== 'undefined' && process.versions?.node) {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    ErrorHandler.logError(error, 'UnhandledRejection', { promise: promise.toString() });
  });

  process.on('uncaughtException', (error: Error) => {
    ErrorHandler.logError(error, 'UncaughtException');
    process.exit(1);
  });
}