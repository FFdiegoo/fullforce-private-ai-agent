import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { EmailService } from '../../../lib/email-service';
import { auditLogger } from '../../../lib/audit-logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
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
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('role, name')
      .eq('email', user.email)
      .single();

    if (!adminProfile || adminProfile.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Get target user
    const { data: targetUser, error: targetUserError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (targetUserError || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Reset 2FA
    const { error: resetError } = await supabaseAdmin
      .from('profiles')
      .update({
        two_factor_enabled: false,
        two_factor_secret: null,
        backup_codes: [],
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (resetError) {
      throw resetError;
    }

    // Send notification email
    await EmailService.send2FANotification(targetUser.email, 'reset');

    // Log the action
    await auditLogger.logAuth('2FA_RESET_BY_ADMIN', user.id, {
      targetUserId: userId,
      targetUserEmail: targetUser.email,
      adminEmail: user.email
    });

    return res.status(200).json({
      success: true,
      message: '2FA reset successfully'
    });

  } catch (error) {
    console.error('2FA reset error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}