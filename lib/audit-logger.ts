import { supabaseAdmin } from './supabaseAdmin';

interface AuditLogData {
  action: string;
  userId: string | null;
  metadata?: any;
  ipAddress: string | null;
  userAgent?: string | null;
  severity?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
}

export class AuditLogger {
  static async log(data: AuditLogData) {
    try {
      const { error } = await supabaseAdmin
        .from('audit_logs')
        .insert({
          user_id: data.userId,
          action: data.action,
          metadata: data.metadata,
          ip_address: data.ipAddress,
          user_agent: data.userAgent,
          severity: data.severity || 'INFO',
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Audit log error:', error);
      }
    } catch (error) {
      console.error('Audit logger error:', error);
    }
  }

  static async logAuth(action: string, userId?: string, metadata?: any, ipAddress?: string) {
    return this.log({
      action,
      userId: userId || null,
      metadata,
      ipAddress: ipAddress || null,
      userAgent: null,
      severity: 'INFO'
    });
  }

  static async logError(error: Error, action: string, userId?: string) {
    return this.log({
      action,
      userId: userId || null,
      metadata: {
        error: error.message,
        stack: error.stack
      },
      ipAddress: null,
      userAgent: null,
      userAgent: null,
      severity: 'ERROR'
    });
  }
}

export const auditLogger = AuditLogger;