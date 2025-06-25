import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { auditLogger } from '../../../lib/audit-logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    // Only allow Diego's specific email
    if (email !== 'diego.a.scognamiglio@gmail.com') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only allow the specific password
    if (password !== 'Hamkaastostimetkaka321@!') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('🔓 Diego bypass access granted');

    // Check if user exists in profiles, create if not
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (profileError && profileError.code === 'PGRST116') {
      // User doesn't exist, create them
      console.log('👤 Creating Diego profile...');
      
      const { data: newProfile, error: createError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: '900098f4-785e-4c26-8a7b-55135f83bb16',
          email: 'diego.a.scognamiglio@gmail.com',
          name: 'Diego',
          role: 'admin',
          two_factor_enabled: true, // Bypass 2FA requirement
          two_factor_secret: 'BYPASS_SECRET',
          backup_codes: ['BYPASS_CODE'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Profile creation error:', createError);
        return res.status(500).json({ error: 'Failed to create profile' });
      }

      profile = newProfile;
    } else if (profileError) {
      console.error('❌ Profile fetch error:', profileError);
      return res.status(500).json({ error: 'Database error' });
    }

    // Ensure user has admin role and 2FA bypass
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        role: 'admin',
        two_factor_enabled: true, // Bypass 2FA requirement
        two_factor_secret: 'BYPASS_SECRET',
        backup_codes: ['BYPASS_CODE'],
        updated_at: new Date().toISOString()
      })
      .eq('email', email);

    if (updateError) {
      console.error('❌ Profile update error:', updateError);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    // Check if auth user exists, create if not
    const { data: authUser } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = authUser.users.find(u => u.email === email);

    if (!existingAuthUser) {
      console.log('🔐 Creating auth user...');
      
      const { data: newAuthUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        id: '900098f4-785e-4c26-8a7b-55135f83bb16',
        email: 'diego.a.scognamiglio@gmail.com',
        password: 'Hamkaastostimetkaka321@!',
        email_confirm: true,
        user_metadata: {
          name: 'Diego',
          bypass_2fa: true
        }
      });

      if (authError) {
        console.error('❌ Auth user creation error:', authError);
        return res.status(500).json({ error: 'Failed to create auth user' });
      }
    }

    await auditLogger.logAuth('DIEGO_BYPASS_ACCESS', profile.id, {
      email,
      method: 'bypass_login'
    });

    return res.status(200).json({
      success: true,
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        two_factor_enabled: true // Shows as enabled to bypass checks
      },
      message: 'Diego bypass access granted'
    });

  } catch (error) {
    console.error('❌ Diego bypass error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}