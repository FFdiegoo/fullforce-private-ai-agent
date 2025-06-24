import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { InviteSystem } from '../../../lib/invite-system';
import { EmailVerification } from '../../../lib/email-verification';
import { auditLogger } from '../../../lib/audit-logger';
import { rateLimitByType } from '../../../lib/rate-limit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || '127.0.0.1';

  try {
    // Rate limiting
    const rateLimitResult = await rateLimitByType(clientIP, 'auth', 5, 300000); // 5 attempts per 5 minutes
    if (!rateLimitResult.success) {
      return res.status(429).json({ error: 'Too many signup attempts' });
    }

    const { inviteCode, password } = req.body;

    if (!inviteCode || !password) {
      return res.status(400).json({ error: 'Invite code and password are required' });
    }

    // Validate invite
    const inviteResult = await InviteSystem.validateInvite(inviteCode);
    if (!inviteResult.valid || !inviteResult.invite) {
      return res.status(400).json({ error: inviteResult.error });
    }

    const invite = inviteResult.invite;

    // Check if email is verified
    const isEmailVerified = await EmailVerification.isEmailVerified(invite.email);
    if (!isEmailVerified) {
      return res.status(400).json({ 
        error: 'Email must be verified before creating account',
        requiresEmailVerification: true
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true, // Skip email confirmation since we already verified
      user_metadata: {
        name: invite.name,
        phone: invite.phone,
        invited_by: invite.createdBy
      }
    });

    if (authError || !authData.user) {
      console.error('Auth user creation error:', authError);
      return res.status(400).json({ 
        error: authError?.message || 'Failed to create user account' 
      });
    }

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        email: invite.email,
        name: invite.name,
        role: 'user',
        two_factor_enabled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Clean up auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: 'Failed to create user profile' });
    }

    // Mark invite as used
    const inviteMarked = await InviteSystem.markInviteAsUsed(inviteCode, authData.user.id);
    if (!inviteMarked) {
      console.warn('Failed to mark invite as used:', inviteCode);
    }

    await auditLogger.logAuth('USER_REGISTERED', authData.user.id, {
      email: invite.email,
      name: invite.name,
      inviteCode,
      invitedBy: invite.createdBy
    }, clientIP);

    return res.status(200).json({
      success: true,
      user: {
        id: authData.user.id,
        email: invite.email,
        name: invite.name
      },
      message: 'Account created successfully. Please set up 2FA.'
    });

  } catch (error) {
    console.error('Signup error:', error);
    await auditLogger.logError(error as Error, 'USER_SIGNUP');
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}