import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { errorMonitoring } from '../../../lib/error-monitoring';
import { auditLogger } from '../../../lib/enhanced-audit-logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

    if (req.method === 'GET') {
      // Get error monitoring stats
      const stats = errorMonitoring.getStats();
      
      // Get recent audit logs for errors
      const { data: recentErrorLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .ilike('action', '%ERROR%')
        .order('created_at', { ascending: false })
        .limit(20);

      const response = {
        timestamp: new Date().toISOString(),
        monitoring: {
          enabled: process.env.ERROR_MONITORING_ENABLED !== 'false',
          stats,
          configuration: {
            adminNotifications: process.env.ADMIN_ERROR_NOTIFICATIONS || 'true',
            environment: process.env.NODE_ENV || 'development'
          }
        },
        recentErrors: recentErrorLogs || [],
        summary: {
          totalErrors: stats.totalErrors,
          criticalErrors: stats.severityBreakdown.CRITICAL || 0,
          highErrors: stats.severityBreakdown.HIGH || 0,
          mostCommonCategory: Object.entries(stats.categoryBreakdown)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none'
        }
      };

      await auditLogger.logAdmin('ERROR_MONITORING_ACCESSED', user.id, undefined, {
        requestedBy: user.email,
        errorCount: stats.totalErrors
      });

      return res.status(200).json(response);

    } else if (req.method === 'POST') {
      // Test error monitoring by creating a test error
      const { type = 'test', message = 'Test error from admin panel' } = req.body;
      
      try {
        if (type === 'critical') {
          throw new Error('CRITICAL TEST ERROR: ' + message);
        } else if (type === 'auth') {
          const authError = new Error('Authentication test error: ' + message);
          authError.name = 'AuthenticationError';
          throw authError;
        } else {
          throw new Error('Test error: ' + message);
        }
      } catch (testError) {
        const errorId = await errorMonitoring.captureError(testError as Error, {
          userId: user.id,
          action: 'ADMIN_TEST_ERROR',
          resource: 'error_monitoring',
          ipAddress: req.headers['x-forwarded-for'] as string || 'unknown',
          metadata: { testType: type, triggeredBy: user.email }
        });

        return res.status(200).json({
          success: true,
          message: 'Test error captured successfully',
          errorId,
          type
        });
      }

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Error monitoring API error:', error);
    
    // Capture this error too
    await errorMonitoring.captureError(error as Error, {
      action: 'ERROR_MONITORING_API_ERROR',
      resource: 'api',
      url: req.url,
      method: req.method
    });

    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}