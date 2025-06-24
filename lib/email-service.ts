import { supabaseAdmin } from './supabaseAdmin';

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  static async sendInviteEmail(email: string, inviteCode: string, inviterName: string): Promise<boolean> {
    try {
      const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/signup?invite=${inviteCode}`;
      
      const template = this.getInviteTemplate(email, inviteUrl, inviterName);
      
      // Using Supabase Edge Functions for email (or you can use Nodemailer)
      const { error } = await supabaseAdmin.functions.invoke('send-email', {
        body: {
          to: email,
          subject: template.subject,
          html: template.html,
          text: template.text
        }
      });

      if (error) {
        console.error('Email send error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Email service error:', error);
      return false;
    }
  }

  static async sendVerificationEmail(email: string, verificationCode: string): Promise<boolean> {
    try {
      const template = this.getVerificationTemplate(email, verificationCode);
      
      const { error } = await supabaseAdmin.functions.invoke('send-email', {
        body: {
          to: email,
          subject: template.subject,
          html: template.html,
          text: template.text
        }
      });

      return !error;
    } catch (error) {
      console.error('Verification email error:', error);
      return false;
    }
  }

  static async send2FANotification(email: string, action: 'enabled' | 'disabled' | 'reset'): Promise<boolean> {
    try {
      const template = this.get2FANotificationTemplate(email, action);
      
      const { error } = await supabaseAdmin.functions.invoke('send-email', {
        body: {
          to: email,
          subject: template.subject,
          html: template.html,
          text: template.text
        }
      });

      return !error;
    } catch (error) {
      console.error('2FA notification email error:', error);
      return false;
    }
  }

  private static getInviteTemplate(email: string, inviteUrl: string, inviterName: string): EmailTemplate {
    return {
      subject: 'You\'re invited to join CSrental AI',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">🛡️ CSrental AI</h1>
            <p style="color: white; margin: 10px 0 0 0;">Secure AI Assistant Platform</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333;">You're Invited!</h2>
            <p style="color: #666; line-height: 1.6;">
              ${inviterName} has invited you to join CSrental AI, our secure AI assistant platform.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
              <p style="margin: 0; color: #333;"><strong>Account:</strong> ${email}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
                Accept Invitation
              </a>
            </div>
            
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border: 1px solid #ffeaa7;">
              <p style="margin: 0; color: #856404; font-size: 14px;">
                ⚠️ <strong>Important:</strong> This invitation expires in 24 hours and can only be used once.
              </p>
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
          
          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 12px;">
              CSrental AI - Secure by Design
            </p>
          </div>
        </div>
      `,
      text: `
You're invited to join CSrental AI!

${inviterName} has invited you to join our secure AI assistant platform.

Account: ${email}

Click here to accept your invitation:
${inviteUrl}

Important: This invitation expires in 24 hours and can only be used once.

If you didn't expect this invitation, you can safely ignore this email.

CSrental AI - Secure by Design
      `
    };
  }

  private static getVerificationTemplate(email: string, verificationCode: string): EmailTemplate {
    return {
      subject: 'Verify your email - CSrental AI',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">🛡️ CSrental AI</h1>
            <p style="color: white; margin: 10px 0 0 0;">Email Verification</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333;">Verify Your Email</h2>
            <p style="color: #666; line-height: 1.6;">
              Please enter this verification code to complete your registration:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <div style="background: white; padding: 20px; border-radius: 8px; border: 2px solid #667eea; display: inline-block;">
                <span style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: monospace;">
                  ${verificationCode}
                </span>
              </div>
            </div>
            
            <div style="background: #d1ecf1; padding: 15px; border-radius: 8px; border: 1px solid #bee5eb;">
              <p style="margin: 0; color: #0c5460; font-size: 14px;">
                ℹ️ This code expires in 10 minutes for security reasons.
              </p>
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              If you didn't request this verification, please ignore this email.
            </p>
          </div>
          
          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 12px;">
              CSrental AI - Secure by Design
            </p>
          </div>
        </div>
      `,
      text: `
Verify Your Email - CSrental AI

Please enter this verification code to complete your registration:

${verificationCode}

This code expires in 10 minutes for security reasons.

If you didn't request this verification, please ignore this email.

CSrental AI - Secure by Design
      `
    };
  }

  private static get2FANotificationTemplate(email: string, action: 'enabled' | 'disabled' | 'reset'): EmailTemplate {
    const actionText = {
      enabled: 'enabled',
      disabled: 'disabled',
      reset: 'reset'
    }[action];

    const actionEmoji = {
      enabled: '✅',
      disabled: '❌',
      reset: '🔄'
    }[action];

    return {
      subject: `2FA ${actionText} - CSrental AI`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">🛡️ CSrental AI</h1>
            <p style="color: white; margin: 10px 0 0 0;">Security Notification</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333;">${actionEmoji} 2FA ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}</h2>
            <p style="color: #666; line-height: 1.6;">
              Two-factor authentication has been ${actionText} for your account: ${email}
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
              <p style="margin: 0; color: #333;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              <p style="margin: 5px 0 0 0; color: #333;"><strong>Account:</strong> ${email}</p>
            </div>
            
            ${action === 'reset' ? `
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border: 1px solid #ffeaa7; margin: 20px 0;">
              <p style="margin: 0; color: #856404; font-size: 14px;">
                ⚠️ <strong>Action Required:</strong> You'll need to set up 2FA again on your next login.
              </p>
            </div>
            ` : ''}
            
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              If you didn't make this change, please contact support immediately.
            </p>
          </div>
          
          <div style="background: #333; padding: 20px; text-align: center;">
            <p style="color: #999; margin: 0; font-size: 12px;">
              CSrental AI - Secure by Design
            </p>
          </div>
        </div>
      `,
      text: `
2FA ${actionText.charAt(0).toUpperCase() + actionText.slice(1)} - CSrental AI

Two-factor authentication has been ${actionText} for your account: ${email}

Time: ${new Date().toLocaleString()}
Account: ${email}

${action === 'reset' ? 'Action Required: You\'ll need to set up 2FA again on your next login.' : ''}

If you didn't make this change, please contact support immediately.

CSrental AI - Secure by Design
      `
    };
  }
}