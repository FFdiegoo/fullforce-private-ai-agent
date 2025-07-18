import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { TwoFactorAuth } from '../../../lib/two-factor';
import { auditLogger } from '../../../lib/audit-logger';
import { applyEnhancedRateLimit } from '../../../lib/enhanced-rate-limiter';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log(`🔄 2FA API called: ${req.method} from ${req.headers['x-forwarded-for'] || 'unknown'}`);

  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ Handling OPTIONS preflight request');
    return res.status(200).end();
  }

  const clientIP =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.connection && (req.connection as any).remoteAddress) ||
    '127.0.0.1';

  // GET method - Check 2FA status
  if (req.method === 'GET') {
    try {
      console.log('📝 Processing GET request for 2FA status...');
      
      // Get authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ No valid authorization header');
        return res.status(401).json({ error: 'No authorization header' });
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);

      if (userError || !user) {
        console.error('❌ Auth error:', userError);
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, two_factor_enabled, backup_codes')
        .eq('email', user.email)
        .single();

      if (!profile) {
        return res.status(404).json({ error: 'User profile not found' });
      }

      const status = {
        enabled: profile.two_factor_enabled || false,
        backupCodesCount: (profile.backup_codes || []).length
      };
      
      return res.status(200).json(status);

    } catch (error) {
      console.error('❌ 2FA status check error:', error);
      return res.status(500).json({
        error: 'Status check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // POST method - Generate 2FA setup
  if (req.method === 'POST') {
    try {
      console.log('📝 Processing POST request for 2FA setup...');
      
      // Rate limiting
      const rateLimitResult = await applyEnhancedRateLimit(clientIP, 'auth');
      if (!rateLimitResult.success) {
        console.log('⚠️ Rate limit exceeded for IP:', clientIP);
        return res.status(429).json({ error: 'Too many requests' });
      }

      // Get authorization header
      const authHeader = req.headers.authorization;
      console.log('🔑 Auth header present:', !!authHeader);
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('❌ No valid authorization header');
        return res.status(401).json({ error: 'No authorization header' });
      }

      const token = authHeader.replace('Bearer ', '');
      console.log('🎫 Token extracted, length:', token.length);

      // Verify the token and get user
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);

      if (userError || !user) {
        console.error('❌ Auth error:', userError);
        return res.status(401).json({ error: 'Invalid token' });
      }

      console.log('✅ User authenticated:', user.email);

      // Get user email
      const userEmail = user.email!;

      // Generate 2FA setup using the new implementation
      console.log('🔐 Generating 2FA setup for user:', userEmail);
      const twoFactorSetup = await TwoFactorAuth.setupTwoFactor(userEmail);
      
      console.log('✅ 2FA setup generated:', {
        hasSecret: !!twoFactorSetup.secret,
        hasQrCode: !!twoFactorSetup.qrCodeUrl,
        backupCodesCount: twoFactorSetup.backupCodes.length,
        qrCodeLength: twoFactorSetup.qrCodeUrl.length
      });

      await auditLogger.logAuth('2FA_SETUP_INITIATED', user.id, {
        email: userEmail
      }, clientIP);

      return res.status(200).json({
        qrCodeUrl: twoFactorSetup.qrCodeUrl,
        backupCodes: twoFactorSetup.backupCodes,
        secret: twoFactorSetup.secret
      });

    } catch (error) {
      console.error('❌ 2FA setup error:', error);
      return res.status(500).json({
        error: '2FA setup failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // PUT method - Verify and enable 2FA
  if (req.method === 'PUT') {
    try {
      console.log('📝 Processing PUT request for 2FA verification...');
      
      // Rate limiting
      const rateLimitResult = await applyEnhancedRateLimit(clientIP, 'auth');
      if (!rateLimitResult.success) {
        return res.status(429).json({ error: 'Too many requests' });
      }

      // Get authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No authorization header' });
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);

      if (userError || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { secret, token: verificationToken, backupCodes } = req.body;

      if (!secret || !verificationToken || !backupCodes) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      console.log('🔍 Verification attempt:', {
        userEmail: user.email,
        hasSecret: !!secret,
        secretLength: secret.length,
        tokenLength: verificationToken?.length,
        backupCodesCount: backupCodes?.length
      });

      // Get user profile ID by email (more reliable than auth.uid())
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', user.email)
        .single();

      if (profileError || !profile) {
        console.error('❌ Profile not found:', profileError);
        return res.status(404).json({ error: 'User profile not found' });
      }

      console.log('✅ Profile found:', profile.id);

      // Verify token using the new implementation
      console.log('🔐 Verifying TOTP with provided secret...');
      
      const verification = TwoFactorAuth.verifyToken(verificationToken, secret);
      
      console.log('🔍 TOTP verification result:', {
        isValid: verification.isValid,
        secret: secret.substring(0, 10) + '...',
        token: verificationToken,
        timestamp: new Date().toISOString()
      });
      
      if (!verification.isValid) {
        console.log('❌ TOTP verification failed');
        await auditLogger.logAuth('2FA_VERIFICATION_FAILED', user.id, {
          email: user.email,
          reason: 'invalid_totp_code'
        }, clientIP);
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      console.log('✅ TOTP verification successful');

      // Save to database with better error handling
      console.log('💾 Saving 2FA settings to database...');
      
      try {
        const { error: dbError } = await supabaseAdmin
          .from('profiles')
          .update({
            two_factor_enabled: true,
            two_factor_secret: secret,
            backup_codes: backupCodes,
            updated_at: new Date().toISOString()
          })
          .eq('id', profile.id);

        if (dbError) {
          console.error('❌ Database update error:', dbError);
          
          // Try alternative approach - update by email
          console.log('🔄 Trying alternative update by email...');
          const { error: dbError2 } = await supabaseAdmin
            .from('profiles')
            .update({
              two_factor_enabled: true,
              two_factor_secret: secret,
              backup_codes: backupCodes,
              updated_at: new Date().toISOString()
            })
            .eq('email', user.email);

          if (dbError2) {
            console.error('❌ Alternative database update also failed:', dbError2);
            return res.status(500).json({ 
              error: 'Failed to save 2FA settings',
              details: `Primary error: ${dbError.message}, Secondary error: ${dbError2.message}`
            });
          }
        }

        console.log('✅ 2FA enabled successfully in database');
        
        await auditLogger.logAuth('2FA_ENABLED', user.id, {
          email: user.email
        }, clientIP);

        return res.status(200).json({ success: true });

      } catch (dbException) {
        console.error('❌ Database exception:', dbException);
        return res.status(500).json({ 
          error: 'Database operation failed',
          details: dbException instanceof Error ? dbException.message : 'Unknown database error'
        });
      }

    } catch (error) {
      console.error('❌ 2FA enable error:', error);
      await auditLogger.logError(error as Error, '2FA_ENABLE');
      return res.status(500).json({
        error: '2FA enable failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // DELETE method - Disable 2FA
  if (req.method === 'DELETE') {
    try {
      console.log('📝 Processing DELETE request for 2FA disable...');
      
      // Rate limiting
      const rateLimitResult = await applyEnhancedRateLimit(clientIP, 'auth');
      if (!rateLimitResult.success) {
        return res.status(429).json({ error: 'Too many requests' });
      }

      // Get authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No authorization header' });
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);

      if (userError || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { token: verificationToken } = req.body;

      if (!verificationToken) {
        return res.status(400).json({ error: 'Verification token required' });
      }

      // Get user profile ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, two_factor_secret, backup_codes')
        .eq('email', user.email)
        .single();

      if (!profile) {
        return res.status(404).json({ error: 'User profile not found' });
      }

      // Verify token or backup code
      let isValid = false;
      
      // Check TOTP token
      if (profile.two_factor_secret) {
        const verification = TwoFactorAuth.verifyToken(verificationToken, profile.two_factor_secret);
        isValid = verification.isValid;
      }
      
      // Check backup code if TOTP failed
      if (!isValid && profile.backup_codes) {
        const verification = TwoFactorAuth.verifyBackupCode(verificationToken, profile.backup_codes);
        isValid = verification.isValid;
        
        // Remove used backup code if valid
        if (isValid) {
          const cleanCode = verificationToken.replace(/[\s-]/g, '').toUpperCase();
          const updatedBackupCodes = profile.backup_codes.filter((code: string) => 
            code.replace(/[\s-]/g, '').toUpperCase() !== cleanCode
          );
          
          await supabaseAdmin
            .from('profiles')
            .update({ backup_codes: updatedBackupCodes })
            .eq('id', profile.id);
        }
      }

      if (!isValid) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      // Disable 2FA
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          two_factor_enabled: false,
          two_factor_secret: null,
          backup_codes: [],
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (updateError) {
        return res.status(500).json({ error: 'Failed to disable 2FA' });
      }

      console.log('✅ 2FA disabled successfully for user:', user.email);
      await auditLogger.logAuth('2FA_DISABLED', user.id, {
        email: user.email
      }, clientIP);
      
      return res.status(200).json({ success: true });

    } catch (error) {
      console.error('❌ 2FA disable error:', error);
      return res.status(500).json({
        error: '2FA disable failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Method not allowed
  console.log('❌ Method not allowed:', req.method);
  return res.status(405).json({ 
    error: 'Method not allowed',
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  });
}