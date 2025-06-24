import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { TwoFactorAuth } from '../../../lib/two-factor';
import { auditLogger } from '../../../lib/audit-logger';
import { rateLimitByType } from '../../../lib/rate-limit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const clientIP = req.headers['x-forwarded-for'] as string || req.connection.remoteAddress || '127.0.0.1';

  if (req.method === 'POST') {
    try {
      // Rate limiting
      const rateLimitResult = await rateLimitByType(clientIP, 'auth');
      if (!rateLimitResult.success) {
        return res.status(429).json({ error: 'Too many requests' });
      }

      // Get current user from session
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);

      if (userError || !user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get user email
      const userEmail = user.email!;

      // Generate 2FA setup
      const twoFactorSetup = await TwoFactorAuth.generateSecret(userEmail);

      await auditLogger.logAuth('2FA_SETUP_INITIATED', user.id, {
        email: userEmail
      }, clientIP);

      return res.status(200).json({
        qrCodeUrl: twoFactorSetup.qrCodeUrl,
        backupCodes: twoFactorSetup.backupCodes,
        secret: twoFactorSetup.secret // Only for setup, remove in production
      });

    } catch (error) {
      console.error('2FA setup error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'PUT') {
    try {
      // Rate limiting
      const rateLimitResult = await rateLimitByType(clientIP, 'auth');
      if (!rateLimitResult.success) {
        return res.status(429).json({ error: 'Too many requests' });
      }

      // Get current user from session
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);

      if (userError || !user) {
        return res.status(401).json({ error: 'Unauthorized' });
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

      return res.status(200).json({ success: true });

    } catch (error) {
      console.error('2FA enable error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}