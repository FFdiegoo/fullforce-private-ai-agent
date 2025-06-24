import { NextApiRequest, NextApiResponse } from 'next';
import { InviteSystem } from '../../../lib/invite-system';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ error: 'Invite code is required' });
    }

    const result = await InviteSystem.validateInvite(inviteCode);

    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json({
      success: true,
      invite: result.invite
    });

  } catch (error) {
    console.error('Validate invite error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}