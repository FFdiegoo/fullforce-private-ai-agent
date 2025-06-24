import { supabaseAdmin } from './supabaseAdmin';
import { EmailService } from './email-service';
import { auditLogger } from './audit-logger';
import crypto from 'crypto';

export class EmailVerification {
  private static readonly CODE_EXPIRY_MINUTES = 10;
  private static readonly MAX_ATTEMPTS = 5;

  static async sendVerificationCode(email: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Generate 6-digit verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.CODE_EXPIRY_MINUTES);

      // Store verification code
      const { error: storeError } = await supabaseAdmin
        .from('email_verifications')
        .upsert({
          email,
          code: verificationCode,
          expires_at: expiresAt.toISOString(),
          attempts: 0,
          verified: false,
          created_at: new Date().toISOString()
        }, {
          onConflict: 'email'
        });

      if (storeError) {
        throw storeError;
      }

      // Send verification email
      const emailSent = await EmailService.sendVerificationEmail(email, verificationCode);
      
      if (!emailSent) {
        return { success: false, error: 'Failed to send verification email' };
      }

      await auditLogger.logAuth('EMAIL_VERIFICATION_SENT', undefined, {
        email,
        expiresAt: expiresAt.toISOString()
      });

      return { success: true };

    } catch (error) {
      await auditLogger.logError(error as Error, 'EMAIL_VERIFICATION_SEND');
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  static async verifyCode(email: string, code: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Get verification record
      const { data: verification, error: fetchError } = await supabaseAdmin
        .from('email_verifications')
        .select('*')
        .eq('email', email)
        .single();

      if (fetchError || !verification) {
        await auditLogger.logAuth('EMAIL_VERIFICATION_FAILED', undefined, {
          email,
          reason: 'no_verification_record'
        });
        return { success: false, error: 'No verification code found for this email' };
      }

      // Check if already verified
      if (verification.verified) {
        return { success: true };
      }

      // Check if expired
      if (new Date(verification.expires_at) < new Date()) {
        await auditLogger.logAuth('EMAIL_VERIFICATION_FAILED', undefined, {
          email,
          reason: 'expired'
        });
        return { success: false, error: 'Verification code has expired' };
      }

      // Check attempts
      if (verification.attempts >= this.MAX_ATTEMPTS) {
        await auditLogger.logAuth('EMAIL_VERIFICATION_FAILED', undefined, {
          email,
          reason: 'max_attempts_exceeded'
        });
        return { success: false, error: 'Too many verification attempts. Please request a new code.' };
      }

      // Verify code
      if (verification.code !== code) {
        // Increment attempts
        await supabaseAdmin
          .from('email_verifications')
          .update({ attempts: verification.attempts + 1 })
          .eq('email', email);

        await auditLogger.logAuth('EMAIL_VERIFICATION_FAILED', undefined, {
          email,
          reason: 'invalid_code',
          attempts: verification.attempts + 1
        });

        return { success: false, error: 'Invalid verification code' };
      }

      // Mark as verified
      const { error: updateError } = await supabaseAdmin
        .from('email_verifications')
        .update({ 
          verified: true,
          verified_at: new Date().toISOString()
        })
        .eq('email', email);

      if (updateError) {
        throw updateError;
      }

      await auditLogger.logAuth('EMAIL_VERIFIED', undefined, {
        email
      });

      return { success: true };

    } catch (error) {
      await auditLogger.logError(error as Error, 'EMAIL_VERIFICATION_VERIFY');
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  static async isEmailVerified(email: string): Promise<boolean> {
    try {
      const { data: verification } = await supabaseAdmin
        .from('email_verifications')
        .select('verified')
        .eq('email', email)
        .single();

      return verification?.verified || false;

    } catch (error) {
      return false;
    }
  }

  static async cleanupExpiredCodes(): Promise<number> {
    try {
      const { data, error } = await supabaseAdmin
        .from('email_verifications')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .eq('verified', false)
        .select('id');

      if (error) {
        throw error;
      }

      const deletedCount = data?.length || 0;
      
      if (deletedCount > 0) {
        await auditLogger.logAuth('EMAIL_VERIFICATIONS_CLEANUP', 'system', {
          deletedCount
        });
      }

      return deletedCount;

    } catch (error) {
      await auditLogger.logError(error as Error, 'EMAIL_VERIFICATIONS_CLEANUP', 'system');
      return 0;
    }
  }
}