// Enhanced audit logging system
import { supabaseAdmin } from '../database/admin';
import { Logger } from './logger';

export type AuditSeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface AuditLogEntry {
  action: string;
  resource?: string;
  userId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  severity: AuditSeverity;
  sessionId?: string;
  requestId?: string;
  timestamp: string;
}

export class AuditLogger {
  private static instance: AuditLogger;
  private logger: Logger;
  private buffer: AuditLogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly bufferSize = 100;
  private readonly flushIntervalMs = 10000; // 10 seconds

  constructor() {
    this.logger = new Logger('AuditLogger');
    
    if (typeof setInterval !== 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
      this.flushInterval = setInterval(() => this.flush(), this.flushIntervalMs);
      this.logger.info('Audit logger initialized with automatic flushing');
    }
  }

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  async log(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    const logEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      severity: entry.severity || 'INFO'
    };

    // Add to buffer
    this.buffer.push(logEntry);

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`Audit: ${logEntry.action}`, {
        userId: logEntry.userId,
        resource: logEntry.resource,
        severity: logEntry.severity,
        metadata: logEntry.metadata
      });
    }

    // Immediate flush for critical events
    if (logEntry.severity === 'CRITICAL' || logEntry.severity === 'ERROR') {
      await this.flush();
    }

    // Flush if buffer is full
    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  async logAuth(action: string, userId?: string, metadata?: Record<string, any>, ipAddress?: string): Promise<void> {
    await this.log({
      action,
      resource: 'auth',
      userId,
      metadata,
      ipAddress,
      severity: 'INFO'
    });
  }

  async logError(error: Error, action: string, userId?: string, metadata?: Record<string, any>): Promise<void> {
    await this.log({
      action,
      resource: 'system',
      userId,
      metadata: {
        ...metadata,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      },
      severity: 'ERROR'
    });
  }

  async logSecurity(event: {
    type: string;
    severity: AuditSeverity;
    details: Record<string, any>;
  }, userId?: string, ipAddress?: string): Promise<void> {
    await this.log({
      action: `SECURITY_${event.type}`,
      resource: 'security',
      userId,
      metadata: event.details,
      ipAddress,
      severity: event.severity
    });
  }

  async logAdmin(action: string, adminId: string, targetUserId?: string, metadata?: Record<string, any>): Promise<void> {
    await this.log({
      action,
      resource: 'admin',
      userId: adminId,
      metadata: {
        ...metadata,
        targetUserId,
        adminAction: true
      },
      severity: 'WARN'
    });
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      const { error } = await supabaseAdmin
        .from('audit_logs')
        .insert(entries.map(entry => ({
          user_id: entry.userId,
          action: entry.action,
          metadata: entry.metadata,
          ip_address: entry.ipAddress,
          user_agent: entry.userAgent,
          severity: entry.severity,
          created_at: entry.timestamp
        })));

      if (error) {
        this.logger.error('Failed to flush audit logs to database', {}, new Error(error.message));
        // Re-add failed entries to buffer
        this.buffer.unshift(...entries);
      } else {
        this.logger.debug(`Flushed ${entries.length} audit log entries`);
      }
    } catch (error) {
      this.logger.error('Audit log flush error', {}, error instanceof Error ? error : new Error(String(error)));
      // Re-add failed entries to buffer
      this.buffer.unshift(...entries);
    }
  }

  async getAuditLogs(filters: {
    userId?: string;
    action?: string;
    severity?: AuditSeverity;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<AuditLogEntry[]> {
    try {
      let query = supabaseAdmin
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters.userId) query = query.eq('user_id', filters.userId);
      if (filters.action) query = query.ilike('action', `%${filters.action}%`);
      if (filters.severity) query = query.eq('severity', filters.severity);
      if (filters.startDate) query = query.gte('created_at', filters.startDate);
      if (filters.endDate) query = query.lte('created_at', filters.endDate);
      if (filters.limit) query = query.limit(filters.limit);
      if (filters.offset) query = query.range(filters.offset, (filters.offset || 0) + (filters.limit || 50) - 1);

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch audit logs: ${error.message}`);
      }

      return (data || []).map(entry => ({
        action: entry.action,
        resource: entry.resource,
        userId: entry.user_id,
        metadata: entry.metadata,
        ipAddress: entry.ip_address,
        userAgent: entry.user_agent,
        severity: entry.severity,
        sessionId: entry.session_id,
        requestId: entry.request_id,
        timestamp: entry.created_at
      }));
    } catch (error) {
      this.logger.error('Failed to fetch audit logs', {}, error instanceof Error ? error : new Error(String(error)));
      return [];
    }
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
export const auditLogger = AuditLogger.getInstance();

// Cleanup on process exit
if (typeof process !== 'undefined' && process.versions?.node) {
  process.on('beforeExit', () => {
    auditLogger.destroy();
  });
}