import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { TwoFactorAuth } from '../../../lib/two-factor';
import { auditLogger } from '../../../lib/audit-logger';
import { rateLimitByType } from '../../../lib/rate-limit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clientIP =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.connection && (req.connection as any).remoteAddress) ||
    '127.0.0.1';

  console.log(`🔄 2FA API called: ${req.method} from IP: ${clientIP}`);

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

      // Verify the token and get user using the regular supabase client
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
        secret: twoFactorSetup.secret // Only for setup, remove in production
      });

    } catch (error) {
      console.error('❌ 2FA setup error:', error);
      return res.status(500).json({
        error: '2FA setup mislukt',
        details: error instanceof Error ? error.message : 'Onbekende fout'
      });
    }
  }

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
        return res.status(400).json({ error: 'Invalid token' });
      }

      console.log('✅ 2FA enabled successfully for user:', user.email);
      return res.status(200).json({ success: true });

    } catch (error) {
      console.error('❌ 2FA enable error:', error);
      return res.status(500).json({
        error: '2FA enable mislukt',
        details: error instanceof Error ? error.message : 'Onbekende fout'
      });
    }
  }

  // Method not allowed
  console.log('❌ Method not allowed:', req.method);
  return res.status(405).json({ error: 'Method not allowed' });
}