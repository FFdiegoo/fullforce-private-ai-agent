import { supabaseAdmin } from './supabaseAdmin';
import { EmailService } from './email-service';
import { auditLogger } from './audit-logger';
import crypto from 'crypto';

export interface InviteData {
  id: string;
  email: string;
  name: string;
  phone?: string;
  inviteCode: string;
  expiresAt: string;
  used: boolean;
  createdBy: string;
  createdAt: string;
}

export class InviteSystem {
  private static readonly INVITE_EXPIRY_HOURS = 24;

  static async createInvite(
    email: string, 
    name: string, 
    phone: string | undefined, 
    createdBy: string,
    inviterName: string
  ): Promise<{ success: boolean; inviteCode?: string; error?: string }> {
    try {
      // Check if user already exists
      const { data: existingUser } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('email', email)
        .single();

      if (existingUser) {
        return { success: false, error: 'User already exists' };
      }

      // Check if there's already a pending invite
      const { data: existingInvite } = await supabaseAdmin
        .from('invites')
        .select('*')
        .eq('email', email)
        .eq('used', false)
        .gte('expires_at', new Date().toISOString())
        .single();

      if (existingInvite) {
        return { success: false, error: 'Pending invite already exists for this email' };
      }

      // Generate unique invite code
      const inviteCode = this.generateInviteCode();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.INVITE_EXPIRY_HOURS);

      // Create invite record
      const { data: invite, error: inviteError } = await supabaseAdmin
        .from('invites')
        .insert({
          email,
          name,
          phone,
          invite_code: inviteCode,
          expires_at: expiresAt.toISOString(),
          used: false,
          created_by: createdBy,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (inviteError) {
        throw inviteError;
      }

      // Send invite email
      const emailSent = await EmailService.sendInviteEmail(email, inviteCode, inviterName);
      
      if (!emailSent) {
        // Delete the invite if email failed
        await supabaseAdmin
          .from('invites')
          .delete()
          .eq('id', invite.id);
        
        return { success: false, error: 'Failed to send invite email' };
      }

      await auditLogger.logAuth('INVITE_CREATED', createdBy, {
        invitedEmail: email,
        invitedName: name,
        inviteCode,
        expiresAt: expiresAt.toISOString()
      });

      return { success: true, inviteCode };

    } catch (error) {
      await auditLogger.logError(error as Error, 'INVITE_CREATE', createdBy);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  static async validateInvite(inviteCode: string): Promise<{
    valid: boolean;
    invite?: InviteData;
    error?: string;
  }> {
    try {
      const { data: invite, error } = await supabaseAdmin
        .from('invites')
        .select('*')
        .eq('invite_code', inviteCode)
        .single();

      if (error || !invite) {
        await auditLogger.logAuth('INVITE_VALIDATION_FAILED', undefined, {
          inviteCode,
          reason: 'not_found'
        });
        return { valid: false, error: 'Invalid invite code' };
      }

      // Check if already used
      if (invite.used) {
        await auditLogger.logAuth('INVITE_VALIDATION_FAILED', undefined, {
          inviteCode,
          reason: 'already_used'
        });
        return { valid: false, error: 'Invite code has already been used' };
      }

      // Check if expired
      if (new Date(invite.expires_at) < new Date()) {
        await auditLogger.logAuth('INVITE_VALIDATION_FAILED', undefined, {
          inviteCode,
          reason: 'expired'
        });
        return { valid: false, error: 'Invite code has expired' };
      }

      await auditLogger.logAuth('INVITE_VALIDATED', undefined, {
        inviteCode,
        invitedEmail: invite.email
      });

      return { 
        valid: true, 
        invite: {
          id: invite.id,
          email: invite.email,
          name: invite.name,
          phone: invite.phone,
          inviteCode: invite.invite_code,
          expiresAt: invite.expires_at,
          used: invite.used,
          createdBy: invite.created_by,
          createdAt: invite.created_at
        }
      };

    } catch (error) {
      await auditLogger.logError(error as Error, 'INVITE_VALIDATE');
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  static async markInviteAsUsed(inviteCode: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from('invites')
        .update({ 
          used: true, 
          used_at: new Date().toISOString(),
          used_by: userId
        })
        .eq('invite_code', inviteCode);

      if (error) {
        throw error;
      }

      await auditLogger.logAuth('INVITE_USED', userId, {
        inviteCode
      });

      return true;

    } catch (error) {
      await auditLogger.logError(error as Error, 'INVITE_MARK_USED', userId);
      return false;
    }
  }

  static async getAllInvites(adminId: string): Promise<InviteData[]> {
    try {
      const { data: invites, error } = await supabaseAdmin
        .from('invites')
        .select(`
          *,
          creator:profiles!invites_created_by_fkey(name, email),
          user:profiles!invites_used_by_fkey(name, email)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return invites || [];

    } catch (error) {
      await auditLogger.logError(error as Error, 'INVITE_LIST', adminId);
      return [];
    }
  }

  static async revokeInvite(inviteId: string, adminId: string): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from('invites')
        .delete()
        .eq('id', inviteId);

      if (error) {
        throw error;
      }

      await auditLogger.logAuth('INVITE_REVOKED', adminId, {
        inviteId
      });

      return true;

    } catch (error) {
      await auditLogger.logError(error as Error, 'INVITE_REVOKE', adminId);
      return false;
    }
  }

  private static generateInviteCode(): string {
    // Generate a secure random invite code
    return crypto.randomBytes(32).toString('hex');
  }

  static async cleanupExpiredInvites(): Promise<number> {
    try {
      const { data, error } = await supabaseAdmin
        .from('invites')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .eq('used', false)
        .select('id');

      if (error) {
        throw error;
      }

      const deletedCount = data?.length || 0;
      
      if (deletedCount > 0) {
        await auditLogger.logAuth('INVITES_CLEANUP', 'system', {
          deletedCount
        });
      }

      return deletedCount;

    } catch (error) {
      await auditLogger.logError(error as Error, 'INVITES_CLEANUP', 'system');
      return 0;
    }
  }
}