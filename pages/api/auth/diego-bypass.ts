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

    console.log('🔓 Diego bypass access request received');

    // 🔧 FIX: First authenticate the user to get the correct user ID
    console.log('🔐 Authenticating user with Supabase Auth...');
    
    let authenticatedUser;
    try {
      const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password
      });

      if (authError || !authData.user) {
        console.log('❌ Authentication failed, user might not exist in auth.users');
        
        // Try to create the user in auth.users if they don't exist
        console.log('🆕 Creating user in auth.users...');
        const { data: createAuthData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
          email: 'diego.a.scognamiglio@gmail.com',
          password: 'Hamkaastostimetkaka321@!',
          email_confirm: true,
          user_metadata: {
            name: 'Diego',
            bypass_2fa: true
          }
        });

        if (createAuthError) {
          console.error('❌ Failed to create auth user:', createAuthError);
          return res.status(500).json({ error: 'Failed to create auth user: ' + createAuthError.message });
        }

        authenticatedUser = createAuthData.user;
        console.log('✅ Auth user created successfully with ID:', authenticatedUser.id);
      } else {
        authenticatedUser = authData.user;
        console.log('✅ User authenticated successfully with ID:', authenticatedUser.id);
      }
    } catch (authException) {
      console.error('❌ Authentication exception:', authException);
      return res.status(500).json({ error: 'Authentication failed' });
    }

    // 🔧 FIX: Now use the authenticated user's ID to update the profile
    console.log('👤 Updating profile with authenticated user ID:', authenticatedUser.id);
    
    // First, check if profile exists
    const { data: existingProfile, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Error checking existing profile:', checkError);
      return res.status(500).json({ error: 'Database error checking profile' });
    }

    let profile;
    if (!existingProfile) {
      // Create new profile with the authenticated user's ID
      console.log('🆕 Creating new profile...');
      const { data: newProfile, error: createError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: authenticatedUser.id, // Use the authenticated user's ID
          email: 'diego.a.scognamiglio@gmail.com',
          name: 'Diego',
          role: 'admin',
          two_factor_enabled: true, // Bypass 2FA requirement
          two_factor_secret: 'BYPASS_SECRET_' + Date.now(),
          backup_codes: ['BYPASS_CODE_' + Date.now()],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Profile creation error:', createError);
        return res.status(500).json({ error: 'Failed to create profile: ' + createError.message });
      }

      profile = newProfile;
      console.log('✅ Profile created successfully');
    } else {
      // Update existing profile to ensure 2FA bypass and admin role
      console.log('🔄 Updating existing profile...');
      const { data: updatedProfile, error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          id: authenticatedUser.id, // Ensure ID matches authenticated user
          role: 'admin',
          two_factor_enabled: true, // Bypass 2FA requirement
          two_factor_secret: 'BYPASS_SECRET_' + Date.now(),
          backup_codes: ['BYPASS_CODE_' + Date.now()],
          updated_at: new Date().toISOString()
        })
        .eq('email', email)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Profile update error:', updateError);
        return res.status(500).json({ error: 'Failed to update profile: ' + updateError.message });
      }

      profile = updatedProfile;
      console.log('✅ Profile updated successfully');
    }

    // Log the bypass access
    await auditLogger.logAuth('DIEGO_BYPASS_ACCESS', authenticatedUser.id, {
      email,
      method: 'bypass_login',
      profileId: profile.id,
      authUserId: authenticatedUser.id
    });

    console.log('✅ Diego bypass access granted successfully');

    return res.status(200).json({
      success: true,
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        two_factor_enabled: true // Shows as enabled to bypass checks
      },
      authUser: {
        id: authenticatedUser.id,
        email: authenticatedUser.email
      },
      message: 'Diego bypass access granted - profile updated with correct user ID'
    });

  } catch (error) {
    console.error('❌ Diego bypass error:', error);
    await auditLogger.logError(error as Error, 'DIEGO_BYPASS');
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}