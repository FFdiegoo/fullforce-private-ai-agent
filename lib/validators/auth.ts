import { z } from 'zod';
import { emailSchema, passwordSchema, phoneSchema, uuidSchema } from './common';

// Authentication validation schemas
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  twoFactorCode: z.string().length(6, 'Two-factor code must be 6 digits').regex(/^\d+$/, 'Two-factor code must be numeric').optional()
});

export const signupSchema = z.object({
  inviteCode: z.string().min(1, 'Invite code is required'),
  password: passwordSchema
});

export const twoFactorSetupSchema = z.object({
  secret: z.string().min(16, 'Invalid secret'),
  token: z.string().length(6, 'Token must be 6 digits').regex(/^\d+$/, 'Token must be numeric'),
  backupCodes: z.array(z.string()).min(1, 'Backup codes required')
});

export const inviteSchema = z.object({
  email: emailSchema,
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  phone: phoneSchema
});

export const validateInviteSchema = z.object({
  inviteCode: z.string().min(1, 'Invite code is required')
});

export const emailVerificationSchema = z.object({
  email: emailSchema,
  code: z.string().length(6, 'Verification code must be 6 digits').regex(/^\d+$/, 'Code must be numeric').optional()
});

export const resetPasswordSchema = z.object({
  email: emailSchema
});

export const emergencyAccessSchema = z.object({
  email: emailSchema,
  emergencyCode: z.string().min(1, 'Emergency code is required')
});

// Type exports
export type LoginRequest = z.infer<typeof loginSchema>;
export type SignupRequest = z.infer<typeof signupSchema>;
export type TwoFactorSetupRequest = z.infer<typeof twoFactorSetupSchema>;
export type InviteRequest = z.infer<typeof inviteSchema>;
export type ValidateInviteRequest = z.infer<typeof validateInviteSchema>;
export type EmailVerificationRequest = z.infer<typeof emailVerificationSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;
export type EmergencyAccessRequest = z.infer<typeof emergencyAccessSchema>;