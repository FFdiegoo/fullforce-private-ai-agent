import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { auditLogger } from '../../../lib/enhanced-audit-logger';
import { applyRateLimit } from '../../../lib/rate-limiter';
import { ErrorHandler } from '../../../lib/error-handler';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const clientIP = ErrorHandler.getClientIP(req);

  try {
    // Rate limiting
    const rateLimitResult = await applyRateLimit(clientIP, 'admin');
    if (!rateLimitResult.success) {
      return res.status(429).json({ error: 'Too many requests' });
    }

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
      await auditLogger.logSecurity({
        type: 'UNAUTHORIZED_ACCESS',
        severity: 'WARN',
        details: {
          resource: 'audit_logs',
          userEmail: user.email,
          reason: 'insufficient_privileges'
        }
      }, user.id, clientIP);

      return res.status(403).json({ error: 'Admin access required' });
    }

    if (req.method === 'GET') {
      const {
        userId,
        action,
        severity,
        startDate,
        endDate,
        limit = '100',
        offset = '0'
      } = req.query;

      const filters = {
        userId: userId as string,
        action: action as string,
        severity: severity as any,
        startDate: startDate as string,
        endDate: endDate as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      };

      const logs = await auditLogger.getAuditLogs(filters);

      await auditLogger.logAdmin('AUDIT_LOGS_ACCESSED', user.id, undefined, {
        filters,
        resultCount: logs.length
      });

      return res.status(200).json({
        logs,
        total: logs.length,
        filters
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    await ErrorHandler.handleApiError(error as Error, req, res, {
      userId: req.body?.userId,
      action: 'AUDIT_LOGS_API',
      ipAddress: clientIP
    });
  }
}