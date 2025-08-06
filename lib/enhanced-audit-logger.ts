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
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Only set up interval in Node.js environment (not Edge Runtime)
    if (typeof setInterval !== 'undefined' && typeof process !== 'undefined' && process.versions && process.versions.node) {
      this.flushInterval = setInterval(() => this.flush(), 5000);
    }
  }

  static getInstance(): EnhancedAuditLogger {
    if (!EnhancedAuditLogger.instance) {
      EnhancedAuditLogger.instance = new EnhancedAuditLogger();
    }
    return EnhancedAuditLogger.instance;
  }

  async log(data: AuditLogData): Promise<void> {
    try {
      const logEntry: AuditLogData = {
        ...data,
        severity: data.severity || 'INFO',
        metadata: {
          ...data.metadata,
          timestamp: new Date().toISOString(),
          environment: (typeof process !== 'undefined' && process.env) ? process.env.NODE_ENV || 'development' : 'development'
        }
      };

      // Add to buffer for batch processing
      this.buffer.push(logEntry);

      // For critical events, flush immediately
      if (data.severity === 'CRITICAL' || data.severity === 'ERROR') {
        await this.flush();
      }
    } catch (error) {
      console.error('Audit logger error:', error);
    }
  }

  async logAuth(action: string, userId?: string, metadata?: Record<string, any>, ipAddress?: string): Promise<void> {
    const logData: AuditLogData = {
      action,
      resource: 'auth',
      severity: 'INFO'
    };
    
    if (userId) logData.userId = userId;
    if (metadata) logData.metadata = metadata;
    if (ipAddress) logData.ipAddress = ipAddress;
    
    await this.log(logData);
  }

  async logSecurity(event: SecurityEvent, userId?: string, ipAddress?: string): Promise<void> {
    const logData: AuditLogData = {
      action: `SECURITY_${event.type}`,
      resource: 'security',
      severity: event.severity
    };
    
    if (userId) logData.userId = userId;
    if (ipAddress) logData.ipAddress = ipAddress;
    if (event.details) logData.metadata = event.details;
    
    await this.log(logData);
  }

  async logDocument(action: string, documentId: string, userId?: string, metadata?: Record<string, any>): Promise<void> {
    const logData: AuditLogData = {
      action,
    const logData: AuditLogData = {
      action: `SECURITY_${event.type}`,
      resource: 'security',
      severity: event.severity
    };
    
    if (userId) logData.userId = userId;
    if (ipAddress) logData.ipAddress = ipAddress;
    if (event.details) logData.metadata = event.details;
    
    await this.log(logData);
    logData.metadata = combinedMetadata;
    
    await this.log(logData);
    const logData: AuditLogData = {
      action,
      resource: 'document',
      severity: 'INFO'
    };
    
    if (userId) logData.userId = userId;
    
    const combinedMetadata = { documentId };
    if (metadata) Object.assign(combinedMetadata, metadata);
    logData.metadata = combinedMetadata;
    
    await this.log(logData);
    const combinedMetadata: Record<string, any> = { adminAction: true };
    if (targetUserId) combinedMetadata.targetUserId = targetUserId;
    if (metadata) Object.assign(combinedMetadata, metadata);
    const logData: AuditLogData = {
      action,
      resource: 'admin',
      userId: adminId,
      severity: 'WARN'
    };
    
    const combinedMetadata: Record<string, any> = { adminAction: true };
    if (targetUserId) combinedMetadata.targetUserId = targetUserId;
    if (metadata) Object.assign(combinedMetadata, metadata);
    logData.metadata = combinedMetadata;
    
    await this.log(logData);
    
    if (userId) logData.userId = userId;
    
    const logData: AuditLogData = {
      action,
      resource: 'system',
      severity: 'ERROR'
    };
    
    if (userId) logData.userId = userId;
    
    const combinedMetadata: Record<string, any> = {
      error: error.message,
      errorType: error.constructor.name
    };
    if (error.stack) combinedMetadata.stack = error.stack;
    if (metadata) Object.assign(combinedMetadata, metadata);
    logData.metadata = combinedMetadata;
    
    await this.log(logData);
    const logData: AuditLogData = {
      action,
      resource: 'system',
    const logData: AuditLogData = {
      action,
      resource: 'system',
      severity: 'CRITICAL',
      metadata: details
    };
    
    if (userId) logData.userId = userId;
    
    await this.log(logData);

    // Send immediate notification for critical events
    await this.sendCriticalAlert(action, details);
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      // Only attempt database write if supabaseAdmin is available
      if (typeof supabaseAdmin !== 'undefined') {
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
      }
    } catch (error) {
      console.error('Audit log flush error:', error);
      // Re-add failed entries to buffer
      this.buffer.unshift(...entries);
    }
  }
    const logData: AuditLogData = {
      action,
      resource: 'auth',
      severity: 'INFO'
    };
    
    if (userId) logData.userId = userId;
    if (metadata) logData.metadata = metadata;
    if (ipAddress) logData.ipAddress = ipAddress;
    
    await this.log(logData);

    // Log to a separate critical events table if needed
    try {
      if (typeof supabaseAdmin !== 'undefined') {
        await supabaseAdmin
          .from('critical_events')
          .insert({
            action,
            details,
            created_at: new Date().toISOString(),
            acknowledged: false
          });
      }
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
      if (typeof supabaseAdmin === 'undefined') {
        return [];
      }

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
      this.flushInterval = null;
    }
    // Flush remaining logs
    this.flush();
  }
}

// Export singleton instance
export const auditLogger = EnhancedAuditLogger.getInstance();

// Cleanup on process exit (only in full Node.js environment, not Edge Runtime)
if (typeof process !== 'undefined' && process.versions && process.versions.node && process.on) {
  process.on('beforeExit', () => {
    auditLogger.destroy();
  });
}