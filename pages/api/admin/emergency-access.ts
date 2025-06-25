import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { auditLogger } from '../../../lib/audit-logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚨 Emergency access request received');
    
    const { email, emergencyCode } = req.body;

    // Emergency access code
    const EMERGENCY_CODE = 'DIEGO_EMERGENCY_2025';

    if (!email || !emergencyCode) {
      return res.status(400).json({ error: 'Email and emergency code required' });
    }

    if (emergencyCode !== EMERGENCY_CODE) {
      console.log('❌ Invalid emergency code provided');
      await auditLogger.logAuth('EMERGENCY_ACCESS_FAILED', undefined, {
        email,
        reason: 'invalid_code'
      });
      return res.status(401).json({ error: 'Invalid emergency code' });
    }

    console.log('🔍 Checking if user exists...');
    
    // Check if user exists in profiles
    const { data: existingProfile, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Error checking user:', checkError);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!existingProfile) {
      console.log('❌ User not found in profiles');
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('✅ User found, granting emergency access...');

    // Force enable 2FA for the user to bypass the requirement
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        two_factor_enabled: true,
        two_factor_secret: 'EMERGENCY_BYPASS_' + Date.now(),
        backup_codes: ['EMERGENCY_' + Date.now()],
        updated_at: new Date().toISOString()
      })
      .eq('email', email);

    if (updateError) {
      console.error('❌ Emergency access update error:', updateError);
      return res.status(500).json({ 
        error: 'Failed to grant emergency access',
        details: updateError.message 
      });
    }

    console.log('✅ Emergency access granted successfully');

    await auditLogger.logAuth('EMERGENCY_ACCESS_GRANTED', existingProfile.id, {
      email,
      grantedAt: new Date().toISOString()
    });

    return res.status(200).json({ 
      success: true, 
      message: 'Emergency access granted. You can now login and access admin dashboard.',
      user: {
        email: existingProfile.email,
        name: existingProfile.name,
        role: existingProfile.role
      }
    });

  } catch (error) {
    console.error('❌ Emergency access error:', error);
    await auditLogger.logError(error as Error, 'EMERGENCY_ACCESS');
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}