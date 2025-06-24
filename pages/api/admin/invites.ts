import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { InviteSystem } from '../../../lib/invite-system';

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
      // Get all invites
      const invites = await InviteSystem.getAllInvites(user.id);
      return res.status(200).json({ invites });

    } else if (req.method === 'DELETE') {
      // Revoke invite
      const { inviteId } = req.body;
      
      if (!inviteId) {
        return res.status(400).json({ error: 'Invite ID is required' });
      }

      const success = await InviteSystem.revokeInvite(inviteId, user.id);
      
      if (!success) {
        return res.status(400).json({ error: 'Failed to revoke invite' });
      }

      return res.status(200).json({ success: true });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Invites API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}