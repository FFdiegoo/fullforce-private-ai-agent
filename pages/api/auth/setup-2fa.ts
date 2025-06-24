import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { TwoFactorAuth } from '../../../lib/two-factor';
import { auditLogger } from '../../../lib/audit-logger';
import { rateLimitByType } from '../../../lib/rate-limit';

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

      const status = await TwoFactorAuth.getUserTwoFactorStatus(profile.id);
      
      return res.status(200).json({
        enabled: status.enabled,
        backupCodesCount: status.backupCodesCount
      });

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
      const rateLimitResult = await rateLimitByType(clientIP, 'auth');
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

      // Generate 2FA setup
      console.log('🔐 Generating 2FA secret for user:', userEmail);
      const twoFactorSetup = await TwoFactorAuth.generateSecret(userEmail);
      
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
      const rateLimitResult = await rateLimitByType(clientIP, 'auth');
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

      // Get user profile ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', user.email)
        .single();

      if (!profile) {
        return res.status(404).json({ error: 'User profile not found' });
      }

      // Enable 2FA
      const success = await TwoFactorAuth.enableTwoFactor(
        profile.id,
        secret,
        verificationToken,
        backupCodes
      );

      if (!success) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      console.log('✅ 2FA enabled successfully for user:', user.email);
      return res.status(200).json({ success: true });

    } catch (error) {
      console.error('❌ 2FA enable error:', error);
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
      const rateLimitResult = await rateLimitByType(clientIP, 'auth');
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
        .select('id')
        .eq('email', user.email)
        .single();

      if (!profile) {
        return res.status(404).json({ error: 'User profile not found' });
      }

      // Disable 2FA
      const success = await TwoFactorAuth.disableTwoFactor(profile.id, verificationToken);

      if (!success) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      console.log('✅ 2FA disabled successfully for user:', user.email);
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