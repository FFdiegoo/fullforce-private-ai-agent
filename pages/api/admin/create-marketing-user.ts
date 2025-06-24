import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { auditLogger } from '../../../lib/audit-logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔧 Creating marketing admin user...');

    // Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: 'marketing@csrental.nl',
      password: 'TempPassword123!', // Temporary password
      email_confirm: true, // Skip email confirmation
      user_metadata: {
        name: 'Marketing Team',
        created_by: 'system'
      }
    });

    if (authError || !authData.user) {
      console.error('❌ Auth user creation error:', authError);
      return res.status(400).json({ 
        error: authError?.message || 'Failed to create auth user' 
      });
    }

    console.log('✅ Auth user created:', authData.user.id);

    // Create profile with admin role
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        email: 'marketing@csrental.nl',
        name: 'Marketing Team',
        role: 'admin',
        two_factor_enabled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      console.error('❌ Profile creation error:', profileError);
      // Clean up auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: 'Failed to create user profile' });
    }

    console.log('✅ Profile created successfully');

    // Generate a magic link for password reset (this will allow them to set their own password)
    const { data: magicLinkData, error: magicLinkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: 'marketing@csrental.nl',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/setup-2fa`
      }
    });

    if (magicLinkError) {
      console.error('❌ Magic link generation error:', magicLinkError);
      return res.status(500).json({ error: 'Failed to generate magic link' });
    }

    console.log('✅ Magic link generated');

    // Log the action
    await auditLogger.logAuth('MARKETING_ADMIN_CREATED', authData.user.id, {
      email: 'marketing@csrental.nl',
      name: 'Marketing Team',
      role: 'admin',
      createdBy: 'system'
    });

    return res.status(200).json({
      success: true,
      user: {
        id: authData.user.id,
        email: 'marketing@csrental.nl',
        name: 'Marketing Team',
        role: 'admin'
      },
      magicLink: magicLinkData.properties?.action_link,
      message: 'Marketing admin user created successfully'
    });

  } catch (error) {
    console.error('❌ Create marketing user error:', error);
    await auditLogger.logError(error as Error, 'MARKETING_ADMIN_CREATE');
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}