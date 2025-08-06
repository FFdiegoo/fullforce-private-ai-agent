// Authentication service
import { BaseService } from './base.service';
import { supabase } from '../database/client';
import { supabaseAdmin } from '../database/admin';
import { TwoFactorAuth } from '../utils/two-factor';
import { EmailService } from './notification.service';
import { 
  loginSchema, 
  signupSchema, 
  twoFactorSetupSchema,
  type LoginRequest,
  type SignupRequest,
  type TwoFactorSetupRequest
} from '../validators/auth';
import type { User, AuthSession, TwoFactorSetup, Result } from '../types';

export class AuthService extends BaseService {
  constructor() {
    super('AuthService');
  }

  async login(credentials: LoginRequest): Promise<Result<AuthSession>> {
    return this.executeWithLogging(
      'USER_LOGIN',
      async () => {
        const validation = this.validateInput(loginSchema, credentials);
        if (!validation.success) {
          throw validation.error;
        }

        const { email, password, twoFactorCode } = validation.data;

        // Authenticate with Supabase
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (authError || !authData.user) {
          throw new Error('Invalid email or password');
        }

        // Get user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', email)
          .single();

        if (profileError || !profile) {
          throw new Error('User profile not found');
        }

        // Check 2FA if enabled
        if (profile.two_factor_enabled) {
          if (!twoFactorCode) {
            throw new Error('Two-factor authentication code required');
          }

          if (!profile.two_factor_secret) {
            throw new Error('Two-factor authentication not properly configured');
          }

          const verification = TwoFactorAuth.verifyToken(twoFactorCode, profile.two_factor_secret);
          if (!verification.isValid) {
            await supabase.auth.signOut();
            throw new Error('Invalid two-factor authentication code');
          }
        }

        const user: User = {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role,
          twoFactorEnabled: profile.two_factor_enabled,
          createdAt: new Date(profile.created_at),
          updatedAt: new Date(profile.updated_at)
        };

        const session: AuthSession = {
          user,
          accessToken: authData.session.access_token,
          refreshToken: authData.session.refresh_token,
          expiresAt: new Date(authData.session.expires_at || Date.now() + 3600000)
        };

        return session;
      },
      undefined,
      { email }
    );
  }

  async signup(signupData: SignupRequest): Promise<Result<User>> {
    return this.executeWithLogging(
      'USER_SIGNUP',
      async () => {
        const validation = this.validateInput(signupSchema, signupData);
        if (!validation.success) {
          throw validation.error;
        }

        // Implementation would continue here...
        throw new Error('Signup implementation needed');
      },
      undefined,
      { inviteCode: signupData.inviteCode }
    );
  }

  async setupTwoFactor(userEmail: string): Promise<Result<TwoFactorSetup>> {
    return this.executeWithLogging(
      'SETUP_2FA',
      async () => {
        const setup = await TwoFactorAuth.setupTwoFactor(userEmail);
        return setup;
      },
      undefined,
      { userEmail }
    );
  }

  async verifyTwoFactor(setupData: TwoFactorSetupRequest, userId: string): Promise<Result<boolean>> {
    return this.executeWithLogging(
      'VERIFY_2FA',
      async () => {
        const validation = this.validateInput(twoFactorSetupSchema, setupData);
        if (!validation.success) {
          throw validation.error;
        }

        const { secret, token, backupCodes } = validation.data;

        // Verify token
        const verification = TwoFactorAuth.verifyToken(token, secret);
        if (!verification.isValid) {
          throw new Error('Invalid verification code');
        }

        // Save to database
        const { error } = await supabaseAdmin
          .from('profiles')
          .update({
            two_factor_enabled: true,
            two_factor_secret: secret,
            backup_codes: backupCodes,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);

        if (error) {
          throw new Error(`Failed to save 2FA settings: ${error.message}`);
        }

        return true;
      },
      userId
    );
  }

  async logout(userId: string): Promise<Result<boolean>> {
    return this.executeWithLogging(
      'USER_LOGOUT',
      async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
          throw new Error(`Logout failed: ${error.message}`);
        }
        return true;
      },
      userId
    );
  }
}

// Export singleton instance
export const authService = new AuthService();