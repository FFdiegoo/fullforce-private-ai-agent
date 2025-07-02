/**
 * Enhanced Error Monitoring System
 * Provides comprehensive error tracking and reporting
 */

import { auditLogger } from './enhanced-audit-logger';

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  action?: string;
  resource?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  url?: string;
  method?: string;
  statusCode?: number;
  stack?: string;
  metadata?: Record<string, any>;
}

export interface ErrorReport {
  id: string;
  timestamp: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  context: ErrorContext;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: string;
  fingerprint: string;
}

class ErrorMonitoring {
  private static instance: ErrorMonitoring;
  private errorBuffer: ErrorReport[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private enabled: boolean;

  constructor() {
    this.enabled = (typeof process !== 'undefined' && process.env) ? process.env.ERROR_MONITORING_ENABLED !== 'false' : true;
    
    // Only set up interval in full Node.js environment (not Edge Runtime)
    if (this.enabled && typeof setInterval !== 'undefined' && typeof process !== 'undefined' && process.versions && process.versions.node) {
      // Flush errors every 30 seconds
      this.flushInterval = setInterval(() => this.flush(), 30000);
      console.log('🔍 Error Monitoring initialized');
    }
  }

  static getInstance(): ErrorMonitoring {
    if (!ErrorMonitoring.instance) {
      ErrorMonitoring.instance = new ErrorMonitoring();
    }
    return ErrorMonitoring.instance;
  }

  async captureError(error: Error, context: ErrorContext = {}): Promise<string> {
    if (!this.enabled) return '';

    const errorId = this.generateErrorId();
    const severity = this.determineSeverity(error, context);
    const category = this.categorizeError(error);
    const fingerprint = this.generateFingerprint(error, context);

    const errorReport: ErrorReport = {
      id: errorId,
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context: {
        ...context,
        stack: error.stack
      },
      severity,
      category,
      fingerprint
    };

    // Add to buffer
    this.errorBuffer.push(errorReport);

    // Log to console immediately for development
    const nodeEnv = (typeof process !== 'undefined' && process.env) ? process.env.NODE_ENV : 'development';
    if (nodeEnv === 'development') {
      console.error(`🚨 [${severity}] ${category}: ${error.message}`, {
        errorId,
        context
      });
    }

    // Log to audit system
    await auditLogger.logError(error, context.action || 'UNKNOWN_ERROR', context.userId, {
      errorId,
      severity,
      category,
      fingerprint,
      context
    });

    // Immediate flush for critical errors
    if (severity === 'CRITICAL') {
      await this.flush();
      await this.sendCriticalAlert(errorReport);
    }

    return errorId;
  }

  async captureException(
    error: Error, 
    req?: any, 
    additionalContext: Record<string, any> = {}
  ): Promise<string> {
    const context: ErrorContext = {
      ...additionalContext,
      url: req?.url,
      method: req?.method,
      ipAddress: this.getClientIP(req),
      userAgent: req?.headers?.['user-agent'],
      requestId: req?.headers?.['x-request-id'] || this.generateRequestId()
    };

    return this.captureError(error, context);
  }

  async captureMessage(
    message: string, 
    level: 'info' | 'warning' | 'error' = 'info',
    context: ErrorContext = {}
  ): Promise<string> {
    const error = new Error(message);
    error.name = `${level.toUpperCase()}_MESSAGE`;
    
    return this.captureError(error, {
      ...context,
      action: context.action || 'CUSTOM_MESSAGE'
    });
  }

  private determineSeverity(error: Error, context: ErrorContext): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    // Critical errors
    if (
      error.message.includes('database') ||
      error.message.includes('auth') ||
      error.message.includes('security') ||
      context.statusCode === 500 ||
      error.name === 'SecurityError'
    ) {
      return 'CRITICAL';
    }

    // High severity errors
    if (
      context.statusCode === 403 ||
      context.statusCode === 401 ||
      error.message.includes('permission') ||
      error.message.includes('unauthorized')
    ) {
      return 'HIGH';
    }

    // Medium severity errors
    if (
      context.statusCode === 400 ||
      context.statusCode === 404 ||
      error.name === 'ValidationError' ||
      error.name === 'TypeError'
    ) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private categorizeError(error: Error): string {
    if (error.message.includes('database') || error.message.includes('sql')) {
      return 'DATABASE_ERROR';
    }
    if (error.message.includes('auth') || error.message.includes('token')) {
      return 'AUTHENTICATION_ERROR';
    }
    if (error.message.includes('permission') || error.message.includes('forbidden')) {
      return 'AUTHORIZATION_ERROR';
    }
    if (error.message.includes('validation') || error.name === 'ValidationError') {
      return 'VALIDATION_ERROR';
    }
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return 'NETWORK_ERROR';
    }
    if (error.name === 'TypeError' || error.name === 'ReferenceError') {
      return 'RUNTIME_ERROR';
    }
    
    return 'UNKNOWN_ERROR';
  }

  private generateFingerprint(error: Error, context: ErrorContext): string {
    // Create a unique fingerprint for grouping similar errors
    const components = [
      error.name,
      error.message.replace(/\d+/g, 'N'), // Replace numbers with N
      context.url?.replace(/\/\d+/g, '/N'), // Replace URL IDs with N
      context.action
    ].filter(Boolean);

    return Buffer.from(components.join('|')).toString('base64').substring(0, 16);
  }

  private async flush(): Promise<void> {
    if (this.errorBuffer.length === 0) return;

    const errors = [...this.errorBuffer];
    this.errorBuffer = [];

    try {
      // In a real implementation, you would send to external service
      // For now, we'll log to audit system
      await auditLogger.log({
        action: 'ERROR_BATCH_FLUSH',
        resource: 'error_monitoring',
        metadata: {
          errorCount: errors.length,
          severityBreakdown: this.getSeverityBreakdown(errors),
          categoryBreakdown: this.getCategoryBreakdown(errors)
        },
        severity: 'INFO'
      });

      console.log(`📊 Error Monitoring: Flushed ${errors.length} errors`);

    } catch (flushError) {
      console.error('❌ Failed to flush errors:', flushError);
      // Re-add errors to buffer
      this.errorBuffer.unshift(...errors);
    }
  }

  private async sendCriticalAlert(errorReport: ErrorReport): Promise<void> {
    console.error('🚨 CRITICAL ERROR ALERT:', {
      id: errorReport.id,
      message: errorReport.error.message,
      context: errorReport.context,
      timestamp: errorReport.timestamp
    });

    // In production, you would send to Slack, email, PagerDuty, etc.
    const adminNotifications = (typeof process !== 'undefined' && process.env) ? process.env.ADMIN_ERROR_NOTIFICATIONS : 'false';
    if (adminNotifications === 'true') {
      // Placeholder for notification system
      console.log('📧 Critical error notification would be sent to admins');
    }
  }

  private getSeverityBreakdown(errors: ErrorReport[]): Record<string, number> {
    return errors.reduce((acc, error) => {
      acc[error.severity] = (acc[error.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private getCategoryBreakdown(errors: ErrorReport[]): Record<string, number> {
    return errors.reduce((acc, error) => {
      acc[error.category] = (acc[error.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private getClientIP(req: any): string {
    if (!req) return 'unknown';
    
    return (
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.connection?.remoteAddress ||
      'unknown'
    );
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  getStats(): {
    totalErrors: number;
    severityBreakdown: Record<string, number>;
    categoryBreakdown: Record<string, number>;
    recentErrors: ErrorReport[];
  } {
    const recentErrors = this.errorBuffer.slice(-10);
    
    return {
      totalErrors: this.errorBuffer.length,
      severityBreakdown: this.getSeverityBreakdown(this.errorBuffer),
      categoryBreakdown: this.getCategoryBreakdown(this.errorBuffer),
      recentErrors
    };
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    // Final flush
    this.flush();
  }
}

// Export singleton instance
export const errorMonitoring = ErrorMonitoring.getInstance();

// Global error handlers (only in full Node.js environment, not Edge Runtime)
if (typeof process !== 'undefined' && process.versions && process.versions.node && process.on) {
  process.on('unhandledRejection', async (reason: any, promise: Promise<any>) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    await errorMonitoring.captureError(error, {
      action: 'UNHANDLED_REJECTION',
      resource: 'process',
      metadata: { promise: promise.toString() }
    });
  });

  process.on('uncaughtException', async (error: Error) => {
    await errorMonitoring.captureError(error, {
      action: 'UNCAUGHT_EXCEPTION',
      resource: 'process'
    });
    
    // Exit process after logging
    setTimeout(() => process.exit(1), 1000);
  });

  process.on('beforeExit', () => {
    errorMonitoring.destroy();
  });
}

// Browser error handler
if (typeof window !== 'undefined') {
  window.addEventListener('error', async (event) => {
    const error = event.error || new Error(event.message);
    await errorMonitoring.captureError(error, {
      action: 'WINDOW_ERROR',
      resource: 'browser',
      url: window.location.href,
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }
    });
  });

  window.addEventListener('unhandledrejection', async (event) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    await errorMonitoring.captureError(error, {
      action: 'UNHANDLED_PROMISE_REJECTION',
      resource: 'browser',
      url: window.location.href
    });
  });
}