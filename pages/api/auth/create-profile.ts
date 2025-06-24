import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { auditLogger } from '../../../lib/audit-logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get current user from session
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    console.log('Creating profile for user:', user.email);

    // Check if profile already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('email', user.email)
      .single();

    if (existingProfile) {
      console.log('Profile already exists:', existingProfile);
      return res.status(200).json({ 
        success: true, 
        profile: existingProfile,
        message: 'Profile already exists'
      });
    }

    // Create new profile
    const { data: newProfile, error: createError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email,
        role: user.email === 'admin@csrental.nl' ? 'admin' : 'user',
        two_factor_enabled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating profile:', createError);
      return res.status(500).json({ 
        error: 'Failed to create profile',
        details: createError.message
      });
    }

    await auditLogger.logAuth('PROFILE_CREATED', user.id, {
      email: user.email,
      role: newProfile.role
    });

    console.log('Profile created successfully:', newProfile);

    return res.status(200).json({ 
      success: true, 
      profile: newProfile,
      message: 'Profile created successfully'
    });

  } catch (error) {
    console.error('Create profile error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}