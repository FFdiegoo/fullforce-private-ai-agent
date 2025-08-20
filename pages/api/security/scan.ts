import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { SecurityScanner } from '../../../lib/security-scanner';
import { auditLogger } from '../../../lib/enhanced-audit-logger';
import { applyEnhancedRateLimit } from '../../../lib/enhanced-rate-limiter';
import { ErrorHandler } from '../../../lib/error-handler';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = ErrorHandler.getClientIP(req);

  try {
    // Rate limiting - stricter for security scans
    const rateLimitResult = await applyEnhancedRateLimit(clientIP, 'admin');
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
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { scanType = 'full' } = req.body;

    let result;

    switch (scanType) {
      case 'dependencies':
        result = await SecurityScanner.scanDependencies();
        break;
      case 'code':
        result = await SecurityScanner.scanCodeSecurity();
        break;
      case 'full':
      default:
        result = await SecurityScanner.generateSecurityReport();
        break;
    }

    await auditLogger.logAdmin('SECURITY_SCAN_INITIATED', user.id, undefined, {
      scanType,
      resultSummary: {
        score: 'overall' in result ? result.overall.score : result.score,
        vulnerabilities: 'overall' in result 
          ? result.overall.criticalIssues 
          : result.vulnerabilities.length
      }
    });

    return res.status(200).json({
      success: true,
      scanType,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    await ErrorHandler.handleApiError(error as Error, req, res, {
      userId: req.body?.userId,
      action: 'SECURITY_SCAN',
      ipAddress: clientIP
    });
  }
}