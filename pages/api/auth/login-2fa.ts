import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { TwoFactorAuth } from '../../../lib/two-factor';
import { auditLogger } from '../../../lib/audit-logger';
import { applyEnhancedRateLimit } from '../../../lib/enhanced-rate-limiter';
import { EnhancedSessionManager } from '../../../lib/enhanced-session-manager';
import { extractDeviceInfo } from '../../../lib/middleware-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || '127.0.0.1';

  try {
    // Rate limiting - 10 attempts per 5 minutes
    const rateLimitResult = await applyEnhancedRateLimit(clientIP, 'auth');
    if (!rateLimitResult.success) {
      return res.status(429).json({ error: 'Too many 2FA attempts' });
    }

    const { email, password, twoFactorCode } = req.body;

    if (!email || !password || !twoFactorCode) {
      return res.status(400).json({ error: 'Email, password, and 2FA code are required' });
    }

    // First, authenticate with email/password
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData.user) {
      await auditLogger.logAuth('LOGIN_FAILED', undefined, {
        email,
        reason: 'invalid_credentials'
      }, clientIP);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get user profile (haal ook het 2FA secret op!)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, two_factor_enabled, two_factor_secret')
      .eq('email', email)
      .single();

    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Check if 2FA is enabled
    if (!profile.two_factor_enabled) {
      return res.status(400).json({ 
        error: '2FA is not enabled for this account',
        requires2FASetup: true
      });
    }

    // Controleer of het secret bestaat
    if (!profile.two_factor_secret) {
      return res.status(400).json({ error: '2FA secret not set for this user' });
    }

    // Verify 2FA code
    const verification = TwoFactorAuth.verifyToken(twoFactorCode, profile.two_factor_secret);

    if (!verification.isValid) {
      // Sign out the user since 2FA failed
      await supabase.auth.signOut();
      
      await auditLogger.logAuth('LOGIN_2FA_FAILED', authData.user.id, {
        email
      }, clientIP);
      
      return res.status(401).json({ error: 'Invalid 2FA code' });
    }

    // Log successful login
    await auditLogger.logAuth('LOGIN_SUCCESS', authData.user.id, {
      email
    }, clientIP);

    // --- SESSION MANAGEMENT TOEVOEGEN ---
    const deviceInfo = extractDeviceInfo(req);
    const sessionId = await EnhancedSessionManager.createSession(
      authData.user.id,
      authData.user.email || email, // <-- FIX: fallback naar request body email
      deviceInfo
    );

    // Set session cookie
    res.setHeader('Set-Cookie', `session-id=${sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${30 * 60}`);

    return res.status(200).json({
      success: true,
      user: authData.user,
      sessionId, // Voor client-side opslag
      message: 'Login successful'
    });

  } catch (error) {
    console.error('2FA login error:', error);
    await auditLogger.logError(error as Error, 'LOGIN_2FA');
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}