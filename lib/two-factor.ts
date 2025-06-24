import speakeasy from 'speakeasy'
import QRCode from 'qrcode'
import { supabaseAdmin } from './supabaseAdmin'
import { auditLogger } from './audit-logger'

export interface TwoFactorSetup {
  secret: string
  qrCodeUrl: string
  backupCodes: string[]
}

export class TwoFactorAuth {
  private static readonly ISSUER = process.env.TOTP_ISSUER || 'CSrental'
  private static readonly WINDOW = parseInt(process.env.TOTP_WINDOW || '2')

  static async generateSecret(userEmail: string): Promise<TwoFactorSetup> {
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: userEmail,
      issuer: this.ISSUER,
      length: 32
    })

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!)

    // Generate backup codes
    const backupCodes = this.generateBackupCodes()

    return {
      secret: secret.base32!,
      qrCodeUrl,
      backupCodes
    }
  }

  static async enableTwoFactor(userId: string, secret: string, token: string, backupCodes: string[]): Promise<boolean> {
    // 🔧 FIX: Verify the token with the provided secret before saving
    console.log('🔐 Verifying token before enabling 2FA...');
    const isValid = this.verifyToken(secret, token)
    if (!isValid) {
      console.log('❌ Token verification failed during enable');
      await auditLogger.logAuth('2FA_ENABLE_FAILED', userId, { reason: 'Invalid token during enable' })
      return false
    }

    try {
      console.log('💾 Saving 2FA settings to database...');
      
      // Update user record in profiles table
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({
          two_factor_enabled: true,
          two_factor_secret: secret,
          backup_codes: backupCodes,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (error) {
        console.error('❌ Database update error:', error);
        throw error
      }

      console.log('✅ 2FA enabled successfully in database');
      await auditLogger.logAuth('2FA_ENABLED', userId)
      return true
    } catch (error) {
      console.error('❌ Error enabling 2FA:', error);
      await auditLogger.logError(error as Error, '2FA_ENABLE', userId)
      return false
    }
  }

  static async disableTwoFactor(userId: string, token: string): Promise<boolean> {
    try {
      // Get user's 2FA secret from database
      const { data: user, error: fetchError } = await supabaseAdmin
        .from('profiles')
        .select('two_factor_secret, backup_codes')
        .eq('id', userId)
        .single()

      if (fetchError || !user) {
        throw new Error('User not found')
      }

      // Verify token or backup code
      const isValidToken = user.two_factor_secret && this.verifyToken(user.two_factor_secret, token)
      const isValidBackupCode = this.verifyBackupCode(user.backup_codes || [], token)

      if (!isValidToken && !isValidBackupCode) {
        await auditLogger.logAuth('2FA_DISABLE_FAILED', userId, { reason: 'Invalid token/backup code' })
        return false
      }

      // Remove backup code if used
      let updatedBackupCodes = user.backup_codes || []
      if (isValidBackupCode) {
        updatedBackupCodes = updatedBackupCodes.filter((code: string) => code !== token)
      }

      // Update user record
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({
          two_factor_enabled: false,
          two_factor_secret: null,
          backup_codes: [],
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (error) {
        throw error
      }

      await auditLogger.logAuth('2FA_DISABLED', userId)
      return true
    } catch (error) {
      await auditLogger.logError(error as Error, '2FA_DISABLE', userId)
      return false
    }
  }

  static verifyToken(secret: string, token: string): boolean {
    console.log('🔍 Verifying TOTP token:', {
      hasSecret: !!secret,
      secretLength: secret?.length,
      tokenLength: token?.length,
      window: this.WINDOW
    });

    try {
      const result = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window: this.WINDOW
      });
      
      console.log('🔐 TOTP verification result:', result);
      return result;
    } catch (error) {
      console.error('❌ TOTP verification error:', error);
      return false;
    }
  }

  static async verifyUserToken(userId: string, token: string): Promise<boolean> {
    try {
      console.log('🔍 Verifying user token for userId:', userId);
      
      const { data: user, error } = await supabaseAdmin
        .from('profiles')
        .select('two_factor_secret, two_factor_enabled, backup_codes')
        .eq('id', userId)
        .single()

      if (error || !user || !user.two_factor_enabled) {
        console.log('❌ User not found or 2FA not enabled');
        return false
      }

      // Check TOTP token
      if (user.two_factor_secret && this.verifyToken(user.two_factor_secret, token)) {
        await auditLogger.logAuth('2FA_VERIFIED', userId, { method: 'totp' })
        return true
      }

      // Check backup code
      if (this.verifyBackupCode(user.backup_codes || [], token)) {
        // Remove used backup code
        const updatedBackupCodes = (user.backup_codes || []).filter((code: string) => code !== token)
        
        await supabaseAdmin
          .from('profiles')
          .update({ backup_codes: updatedBackupCodes })
          .eq('id', userId)

        await auditLogger.logAuth('2FA_VERIFIED', userId, { 
          method: 'backup_code',
          remainingBackupCodes: updatedBackupCodes.length 
        })
        return true
      }

      await auditLogger.logAuth('2FA_VERIFICATION_FAILED', userId)
      return false
    } catch (error) {
      await auditLogger.logError(error as Error, '2FA_VERIFY', userId)
      return false
    }
  }

  static verifyBackupCode(backupCodes: string[], code: string): boolean {
    return backupCodes.includes(code)
  }

  static generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = []
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric code
      const code = Math.random().toString(36).substring(2, 10).toUpperCase()
      codes.push(code)
    }
    return codes
  }

  static async regenerateBackupCodes(userId: string): Promise<string[]> {
    try {
      const newBackupCodes = this.generateBackupCodes()

      const { error } = await supabaseAdmin
        .from('profiles')
        .update({
          backup_codes: newBackupCodes,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (error) {
        throw error
      }

      await auditLogger.logAuth('BACKUP_CODES_REGENERATED', userId)
      return newBackupCodes
    } catch (error) {
      await auditLogger.logError(error as Error, 'BACKUP_CODES_REGENERATE', userId)
      throw error
    }
  }

  static async getUserTwoFactorStatus(userId: string): Promise<{
    enabled: boolean
    backupCodesCount: number
  }> {
    try {
      const { data: user, error } = await supabaseAdmin
        .from('profiles')
        .select('two_factor_enabled, backup_codes')
        .eq('id', userId)
        .single()

      if (error || !user) {
        return { enabled: false, backupCodesCount: 0 }
      }

      return {
        enabled: user.two_factor_enabled || false,
        backupCodesCount: (user.backup_codes || []).length
      }
    } catch (error) {
      await auditLogger.logError(error as Error, '2FA_STATUS_CHECK', userId)
      return { enabled: false, backupCodesCount: 0 }
    }
  }
}