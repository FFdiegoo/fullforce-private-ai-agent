import { NextApiRequest, NextApiResponse } from 'next';
import { EmailVerification } from '../../../lib/email-verification';
import { applyEnhancedRateLimit } from '../../../lib/enhanced-rate-limiter';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || '127.0.0.1';
  
  if (req.method === 'POST') {
    // Send verification code
    try {
      // Rate limiting - 3 requests per 5 minutes per IP
      const rateLimitResult = await applyEnhancedRateLimit(clientIP, 'auth');
      if (!rateLimitResult.success) {
        return res.status(429).json({ error: 'Too many verification requests' });
      }

      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const result = await EmailVerification.sendVerificationCode(email);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      return res.status(200).json({
        success: true,
        message: 'Verification code sent'
      });

    } catch (error) {
      console.error('Send verification error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }

  } else if (req.method === 'PUT') {
    // Verify code
    try {
      // Rate limiting - 10 attempts per 5 minutes per IP
      const rateLimitResult = await applyEnhancedRateLimit(clientIP, 'auth');
      if (!rateLimitResult.success) {
        return res.status(429).json({ error: 'Too many verification attempts' });
      }

      const { email, code } = req.body;

      if (!email || !code) {
        return res.status(400).json({ error: 'Email and code are required' });
      }

      const result = await EmailVerification.verifyCode(email, code);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      return res.status(200).json({
        success: true,
        message: 'Email verified successfully'
      });

    } catch (error) {
      console.error('Verify code error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }

  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}