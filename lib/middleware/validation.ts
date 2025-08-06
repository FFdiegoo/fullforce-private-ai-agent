// Validation middleware for API routes
import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { ValidationError } from '../utils/errors';
import { Logger } from '../utils/logger';

const logger = new Logger('ValidationMiddleware');

export interface ValidatedRequest<T = any> extends NextApiRequest {
  validatedData: T;
  requestId: string;
}

export function withValidation<T>(schema: z.ZodSchema<T>) {
  return function validationMiddleware(
    handler: (req: ValidatedRequest<T>, res: NextApiResponse) => Promise<void> | void
  ) {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      
      try {
        // Validate request body
        const validatedData = schema.parse(req.body);
        
        // Add validated data and request ID to request object
        const validatedRequest = req as ValidatedRequest<T>;
        validatedRequest.validatedData = validatedData;
        validatedRequest.requestId = requestId;

        logger.debug('Request validation passed', {
          requestId,
          method: req.method,
          url: req.url,
          hasBody: !!req.body
        });

        // Call the actual handler
        await handler(validatedRequest, res);

      } catch (error) {
        if (error instanceof z.ZodError) {
          const validationError = new ValidationError(
            'Request validation failed',
            error.errors.reduce((acc, err) => {
              acc[err.path.join('.')] = err.message;
              return acc;
            }, {} as Record<string, string>)
          );

          logger.warn('Request validation failed', {
            requestId,
            method: req.method,
            url: req.url,
            errors: error.errors
          });

          return res.status(400).json({
            success: false,
            error: validationError.message,
            code: validationError.code,
            timestamp: validationError.timestamp,
            requestId
          });
        }

        logger.error('Validation middleware error', { requestId }, error instanceof Error ? error : new Error(String(error)));
        
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          timestamp: new Date().toISOString(),
          requestId
        });
      }
    };
  };
}

// Method validation middleware
export function withMethodValidation(allowedMethods: string[]) {
  return function methodMiddleware(
    handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void
  ) {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      if (!allowedMethods.includes(req.method || '')) {
        logger.warn('Method not allowed', {
          method: req.method,
          url: req.url,
          allowedMethods
        });

        return res.status(405).json({
          success: false,
          error: 'Method not allowed',
          code: 'METHOD_NOT_ALLOWED',
          allowedMethods,
          timestamp: new Date().toISOString()
        });
      }

      await handler(req, res);
    };
  };
}

// Combined middleware for common API patterns
export function withApiValidation<T>(
  schema: z.ZodSchema<T>,
  allowedMethods: string[] = ['POST']
) {
  return function combinedMiddleware(
    handler: (req: ValidatedRequest<T>, res: NextApiResponse) => Promise<void> | void
  ) {
    return withMethodValidation(allowedMethods)(
      withValidation(schema)(handler)
    );
  };
}