import { NextApiRequest, NextApiResponse } from 'next';
import { EnhancedSessionManager } from '../../../lib/enhanced-session-manager';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sessionId = req.cookies['session-id'] || req.body.sessionId;
    
    if (sessionId) {
      await EnhancedSessionManager.invalidateSession(sessionId, 'user_logout');
    }

    // Clear session cookie
    res.setHeader('Set-Cookie', 'session-id=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}