// Base service class with common functionality
import { auditLogger } from '../utils/audit-logger';
import { Logger } from '../utils/logger';
import type { Result } from '../types';

export abstract class BaseService {
  protected logger: Logger;

  constructor(serviceName: string) {
    this.logger = new Logger(serviceName);
  }

  protected async executeWithLogging<T>(
    operation: string,
    fn: () => Promise<T>,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<Result<T>> {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Starting ${operation}`, { userId, metadata });
      
      const result = await fn();
      
      const duration = Date.now() - startTime;
      this.logger.info(`Completed ${operation}`, { 
        userId, 
        metadata, 
        duration,
        success: true 
      });

      await auditLogger.log({
        action: operation,
        userId,
        metadata: { ...metadata, duration, success: true },
        severity: 'INFO'
      });

      return { success: true, data: result };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error(`Failed ${operation}`, { 
        userId, 
        metadata, 
        duration,
        error: errorMessage,
        success: false 
      });

      await auditLogger.logError(
        error instanceof Error ? error : new Error(errorMessage),
        operation,
        userId,
        { ...metadata, duration }
      );

      return { success: false, error: error instanceof Error ? error : new Error(errorMessage) };
    }
  }

  protected validateInput<T>(schema: any, data: unknown): Result<T> {
    try {
      const validatedData = schema.parse(data);
      return { success: true, data: validatedData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
        return { success: false, error: new Error(`Validation failed: ${errorMessage}`) };
      }
      return { success: false, error: error instanceof Error ? error : new Error('Validation failed') };
    }
  }

  protected handleError(error: unknown, context: string): Error {
    if (error instanceof Error) {
      return error;
    }
    
    this.logger.error(`Unexpected error in ${context}`, { error });
    return new Error(`Unexpected error in ${context}: ${String(error)}`);
  }
}

export { BaseService }