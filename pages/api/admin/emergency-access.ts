import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, emergencyCode } = req.body;

    // Emergency access code (change this to something secure)
    const EMERGENCY_CODE = 'DIEGO_EMERGENCY_2025';

    if (emergencyCode !== EMERGENCY_CODE) {
      return res.status(401).json({ error: 'Invalid emergency code' });
    }

    // Force enable 2FA for the user to bypass the requirement
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        two_factor_enabled: true,
        two_factor_secret: 'EMERGENCY_BYPASS',
        backup_codes: ['EMERGENCY'],
        updated_at: new Date().toISOString()
      })
      .eq('email', email);

    if (error) {
      console.error('Emergency access error:', error);
      return res.status(500).json({ error: 'Failed to grant emergency access' });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Emergency access granted. You can now login and access admin dashboard.' 
    });

  } catch (error) {
    console.error('Emergency access error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}