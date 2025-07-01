import { NextApiRequest, NextApiResponse } from 'next';
import { EnhancedSessionManager } from '../../../lib/enhanced-session-manager';
import { getUserRole } from '../../../lib/middleware-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const session = await EnhancedSessionManager.validateSession(sessionId);
    
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const userRole = await getUserRole(session.userId);

    res.status(200).json({
      valid: true,
      session: {
        userId: session.userId,
        email: session.email,
        role: userRole?.role || 'user',
        permissions: userRole?.permissions || [],
        expiresAt: session.expiresAt,
        lastActivity: session.lastActivity
      }
    });

  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}