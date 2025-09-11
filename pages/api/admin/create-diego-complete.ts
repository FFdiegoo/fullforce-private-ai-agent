import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { auditLogger } from '../../../lib/audit-logger';

const DIEGO_EMAIL = process.env.DIEGO_EMAIL as string;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔧 Creating complete Diego user account...');

    // Generate a secure temporary password
    const tempPassword = 'TempPass' + Math.random().toString(36).substring(2, 15) + '!';
    console.log('🔑 Generated secure temporary password');

    // First, check if user already exists in auth
    const { data: existingAuthUser } = await supabaseAdmin.auth.admin.getUserById('900098f4-785e-4c26-8a7b-55135f83bb16');
    
    if (existingAuthUser.user) {
      console.log('⚠️ Auth user already exists, updating...');
      
      // Update existing auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        '900098f4-785e-4c26-8a7b-55135f83bb16',
        {
          email: DIEGO_EMAIL,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            name: 'Diego',
            phone: '0614759664',
            created_by: 'admin_manual'
          }
        }
      );

      if (authError) {
        console.error('❌ Auth user update error:', authError);
        return res.status(400).json({ 
          error: authError.message || 'Failed to update auth user' 
        });
      }

      console.log('✅ Auth user updated successfully');
    } else {
      console.log('🆕 Creating new auth user...');
      
      // Create new auth user with specific UUID
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        id: '900098f4-785e-4c26-8a7b-55135f83bb16',
        email: DIEGO_EMAIL,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          name: 'Diego',
          phone: '0614759664',
          created_by: 'admin_manual'
        }
      });

      if (authError) {
        console.error('❌ Auth user creation error:', authError);
        return res.status(400).json({ 
          error: authError.message || 'Failed to create auth user' 
        });
      }

      console.log('✅ Auth user created successfully');
    }

    // Clean up any existing profiles with this email first
    console.log('🧹 Cleaning up existing profiles...');
    await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('email', DIEGO_EMAIL);

    // Also clean up by ID if exists
    await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', '900098f4-785e-4c26-8a7b-55135f83bb16');

    console.log('✅ Existing profiles cleaned up');

    // Create new profile with all correct data
    console.log('👤 Creating new profile...');
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: '900098f4-785e-4c26-8a7b-55135f83bb16',
        email: DIEGO_EMAIL,
        name: 'Diego',
        role: 'admin',
        two_factor_enabled: false,
        two_factor_secret: null,
        backup_codes: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (profileError) {
      console.error('❌ Profile creation error:', profileError);
      return res.status(500).json({ 
        error: 'Failed to create user profile',
        details: profileError.message 
      });
    }

    console.log('✅ Profile created successfully:', profileData);

    // Generate a password reset link instead of magic link
    const { data: resetLinkData, error: resetLinkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: DIEGO_EMAIL,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/setup-2fa`
      }
    });

    if (resetLinkError) {
      console.error('❌ Reset link generation error:', resetLinkError);
      // Don't fail the whole process for this
    }

    // Log the action
    await auditLogger.logAuth('DIEGO_COMPLETE_USER_CREATED', '900098f4-785e-4c26-8a7b-55135f83bb16', {
      email: DIEGO_EMAIL,
      name: 'Diego',
      phone: '0614759664',
      role: 'admin',
      method: 'manual_creation'
    });

    return res.status(200).json({
      success: true,
      user: {
        id: '900098f4-785e-4c26-8a7b-55135f83bb16',
        email: DIEGO_EMAIL,
        name: 'Diego',
        phone: '0614759664',
        role: 'admin',
        two_factor_enabled: false
      },
      profile: profileData,
      resetLink: resetLinkData?.properties?.action_link,
      message: 'Diego complete user account created successfully',
      loginCredentials: {
        email: DIEGO_EMAIL,
        password: tempPassword,
        note: 'Temporary password - user should change after first login'
      }
    });

  } catch (error) {
    console.error('❌ Create Diego complete user error:', error);
    await auditLogger.logError(error as Error, 'DIEGO_COMPLETE_USER_CREATE');
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}