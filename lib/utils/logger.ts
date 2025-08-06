// Centralized logging utility
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service?: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class Logger {
  private service: string;
  private requestId?: string;

  constructor(service: string, requestId?: string) {
    this.service = service;
    this.requestId = requestId;
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, metadata?: Record<string, any>, error?: Error): void {
    const errorMetadata = error ? {
      ...metadata,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    } : metadata;

    this.log('error', message, errorMetadata);
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: this.service,
      requestId: this.requestId,
      metadata
    };

    // In development, use console with colors
    if (process.env.NODE_ENV === 'development') {
      this.logToConsole(entry);
    } else {
      // In production, use structured JSON logging
      this.logToJSON(entry);
    }
  }

  private logToConsole(entry: LogEntry): void {
    const colors = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m'  // Red
    };

    const reset = '\x1b[0m';
    const color = colors[entry.level];
    
    const prefix = `${color}[${entry.level.toUpperCase()}]${reset}`;
    const service = entry.service ? `[${entry.service}]` : '';
    const timestamp = `[${new Date(entry.timestamp).toLocaleTimeString()}]`;
    
    console.log(`${prefix} ${timestamp} ${service} ${entry.message}`);
    
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      console.log('  Metadata:', entry.metadata);
    }
  }

  private logToJSON(entry: LogEntry): void {
    console.log(JSON.stringify(entry));
  }

  // Create child logger with additional context
  child(additionalContext: Record<string, any>): Logger {
    const childLogger = new Logger(this.service, this.requestId);
    
    // Override log method to include additional context
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level: LogLevel, message: string, metadata?: Record<string, any>) => {
      originalLog(level, message, { ...additionalContext, ...metadata });
    };

    return childLogger;
  }

  // Performance logging helper
  async time<T>(operation: string, fn: () => Promise<T>, metadata?: Record<string, any>): Promise<T> {
    const startTime = Date.now();
    this.debug(`Starting ${operation}`, metadata);

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      this.info(`Completed ${operation}`, { 
        ...metadata, 
        duration,
        success: true 
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.error(`Failed ${operation}`, { 
        ...metadata, 
        duration,
        success: false 
      }, error instanceof Error ? error : new Error(String(error)));

      throw error;
    }
  }
}

// Global logger instance
export const logger = new Logger('Global');

// Request-scoped logger factory
export function createRequestLogger(requestId: string, service: string = 'API'): Logger {
  return new Logger(service, requestId);
}