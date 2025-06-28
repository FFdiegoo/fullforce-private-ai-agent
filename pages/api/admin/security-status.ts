import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { getAllRateLimitStats } from '../../../lib/enhanced-rate-limiter';
import { EnhancedSessionManager } from '../../../lib/enhanced-session-manager';
import { auditLogger } from '../../../lib/enhanced-audit-logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('email', user.email)
      .single();

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Gather security status information
    const securityStatus = {
      timestamp: new Date().toISOString(),
      
      // Rate Limiting Status
      rateLimiting: {
        enabled: true,
        stats: getAllRateLimitStats(),
        configuration: {
          authMax: process.env.RATE_LIMIT_AUTH_MAX || '5',
          uploadMax: process.env.RATE_LIMIT_UPLOAD_MAX || '10',
          chatMax: process.env.RATE_LIMIT_CHAT_MAX || '50',
          adminMax: process.env.RATE_LIMIT_ADMIN_MAX || '20',
          generalMax: process.env.RATE_LIMIT_MAX_REQUESTS || '100',
          windowMs: process.env.RATE_LIMIT_WINDOW_MS || '900000'
        }
      },
      
      // Session Management Status
      sessionManagement: {
        enabled: true,
        stats: EnhancedSessionManager.getSessionStats(),
        configuration: {
          timeoutMinutes: process.env.SESSION_TIMEOUT_MINUTES || '30',
          refreshThresholdMinutes: process.env.SESSION_REFRESH_THRESHOLD_MINUTES || '5'
        }
      },
      
      // Audit Logging Status
      auditLogging: {
        enabled: true,
        recentLogs: await getRecentAuditLogs(),
        configuration: {
          errorMonitoring: process.env.ERROR_MONITORING_ENABLED || 'true',
          adminNotifications: process.env.ADMIN_ERROR_NOTIFICATIONS || 'true'
        }
      },
      
      // Security Headers Status
      securityHeaders: {
        cspEnabled: process.env.CSP_ENABLED || 'true',
        hstsEnabled: process.env.HSTS_ENABLED || 'true'
      },
      
      // Environment Status
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        supabaseConfigured: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        openaiConfigured: !!process.env.OPENAI_API_KEY
      }
    };

    // Log admin access to security status
    await auditLogger.logAdmin('SECURITY_STATUS_ACCESSED', user.id, undefined, {
      requestedBy: user.email,
      timestamp: securityStatus.timestamp
    });

    return res.status(200).json(securityStatus);

  } catch (error) {
    console.error('Security status error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function getRecentAuditLogs() {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('action, severity, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching recent audit logs:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getRecentAuditLogs:', error);
    return [];
  }
}