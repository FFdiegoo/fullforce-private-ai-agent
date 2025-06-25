import { supabaseAdmin } from './supabaseAdmin';

export type AuditSeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface AuditLogData {
  action: string;
  resource?: string;
  userId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  severity?: AuditSeverity;
  sessionId?: string;
  requestId?: string;
}

export interface SecurityEvent {
  type: 'RATE_LIMIT_EXCEEDED' | 'SUSPICIOUS_ACTIVITY' | 'UNAUTHORIZED_ACCESS' | 'BRUTE_FORCE_ATTEMPT';
  severity: AuditSeverity;
  details: Record<string, any>;
}

export class EnhancedAuditLogger {
  private static instance: EnhancedAuditLogger;
  private buffer: AuditLogData[] = [];
  private flushInterval: NodeJS.Timeout;

  constructor() {
    // Flush buffer every 5 seconds
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  static getInstance(): EnhancedAuditLogger {
    if (!EnhancedAuditLogger.instance) {
      EnhancedAuditLogger.instance = new EnhancedAuditLogger();
    }
    return EnhancedAuditLogger.instance;
  }

  async log(data: AuditLogData): Promise<void> {
    const logEntry: AuditLogData = {
      ...data,
      severity: data.severity || 'INFO',
      metadata: {
        ...data.metadata,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      }
    };

    // Add to buffer for batch processing
    this.buffer.push(logEntry);

    // For critical events, flush immediately
    if (data.severity === 'CRITICAL' || data.severity === 'ERROR') {
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

  async logSecurity(event: SecurityEvent, userId?: string, ipAddress?: string): Promise<void> {
    await this.log({
      action: `SECURITY_${event.type}`,
      resource: 'security',
      userId,
      metadata: event.details,
      ipAddress,
      severity: event.severity
    });
  }

  async logDocument(action: string, documentId: string, userId?: string, metadata?: Record<string, any>): Promise<void> {
    await this.log({
      action,
      resource: 'document',
      userId,
      metadata: {
        ...metadata,
        documentId
      },
      severity: 'INFO'
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

  async logError(error: Error, action: string, userId?: string, metadata?: Record<string, any>): Promise<void> {
    await this.log({
      action,
      resource: 'system',
      userId,
      metadata: {
        ...metadata,
        error: error.message,
        stack: error.stack,
        errorType: error.constructor.name
      },
      severity: 'ERROR'
    });
  }

  async logCritical(action: string, details: Record<string, any>, userId?: string): Promise<void> {
    await this.log({
      action,
      resource: 'system',
      userId,
      metadata: details,
      severity: 'CRITICAL'
    });

    // Send immediate notification for critical events
    await this.sendCriticalAlert(action, details);
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
          created_at: new Date().toISOString()
        })));

      if (error) {
        console.error('Failed to flush audit logs:', error);
        // Re-add failed entries to buffer
        this.buffer.unshift(...entries);
      }
    } catch (error) {
      console.error('Audit log flush error:', error);
      // Re-add failed entries to buffer
      this.buffer.unshift(...entries);
    }
  }

  private async sendCriticalAlert(action: string, details: Record<string, any>): Promise<void> {
    // In a real implementation, this would send alerts via email, Slack, etc.
    console.error('🚨 CRITICAL SECURITY EVENT:', {
      action,
      details,
      timestamp: new Date().toISOString()
    });

    // Log to a separate critical events table if needed
    try {
      await supabaseAdmin
        .from('critical_events')
        .insert({
          action,
          details,
          created_at: new Date().toISOString(),
          acknowledged: false
        });
    } catch (error) {
      console.error('Failed to log critical event:', error);
    }
  }

  async getAuditLogs(filters: {
    userId?: string;
    action?: string;
    severity?: AuditSeverity;
    startDate?: string;
    endDate?: string;
    limit?: number;
  } = {}): Promise<any[]> {
    try {
      let query = supabaseAdmin
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.action) {
        query = query.ilike('action', `%${filters.action}%`);
      }

      if (filters.severity) {
        query = query.eq('severity', filters.severity);
      }

      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return [];
    }
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    // Flush remaining logs
    this.flush();
  }
}

// Export singleton instance
export const auditLogger = EnhancedAuditLogger.getInstance();

// Cleanup on process exit
process.on('beforeExit', () => {
  auditLogger.destroy();
});