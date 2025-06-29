import * as crypto from 'crypto';
import * as qrcode from 'qrcode';

export interface TwoFactorSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface TwoFactorVerification {
  isValid: boolean;
  usedBackupCode?: boolean;
}

export class TwoFactorAuth {
  private static readonly ISSUER = process.env.TOTP_ISSUER || 'CSrental';
  private static readonly WINDOW = parseInt(process.env.TOTP_WINDOW || '2');
  private static readonly PERIOD = 30; // seconds

  static generateSecret(): string {
    // Generate a 160-bit (20-byte) secret, base32 encoded
    const buffer = crypto.randomBytes(20);
    return this.base32Encode(buffer);
  }

  static async generateQRCode(secret: string, userEmail: string): Promise<string> {
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(this.ISSUER)}:${encodeURIComponent(userEmail)}?secret=${secret}&issuer=${encodeURIComponent(this.ISSUER)}&algorithm=SHA1&digits=6&period=${this.PERIOD}`;
    
    try {
      return await qrcode.toDataURL(otpauthUrl, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (error) {
      console.error('QR code generation failed:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  static generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric codes
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code.match(/.{2}/g)?.join('-') || code);
    }
    return codes;
  }

  static async setupTwoFactor(userEmail: string): Promise<TwoFactorSetup> {
    try {
      const secret = this.generateSecret();
      const qrCodeUrl = await this.generateQRCode(secret, userEmail);
      const backupCodes = this.generateBackupCodes();

      return {
        secret,
        qrCodeUrl,
        backupCodes
      };
    } catch (error) {
      console.error('2FA setup failed:', error);
      throw new Error('Failed to setup two-factor authentication');
    }
  }

  static verifyToken(token: string, secret: string): TwoFactorVerification {
    if (!token || !secret) {
      return { isValid: false };
    }

    // Clean the token (remove spaces, dashes)
    const cleanToken = token.replace(/[\s-]/g, '');
    
    if (!/^\d{6}$/.test(cleanToken)) {
      return { isValid: false };
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const currentWindow = Math.floor(currentTime / this.PERIOD);

    // Check current window and adjacent windows for clock drift
    for (let i = -this.WINDOW; i <= this.WINDOW; i++) {
      const testWindow = currentWindow + i;
      const expectedToken = this.generateTOTP(secret, testWindow);
      
      if (cleanToken === expectedToken) {
        return { isValid: true };
      }
    }

    return { isValid: false };
  }

  static verifyBackupCode(code: string, backupCodes: string[]): TwoFactorVerification {
    if (!code || !backupCodes || backupCodes.length === 0) {
      return { isValid: false };
    }

    const cleanCode = code.replace(/[\s-]/g, '').toUpperCase();
    const isValid = backupCodes.some(backupCode => 
      backupCode.replace(/[\s-]/g, '').toUpperCase() === cleanCode
    );

    return { isValid, usedBackupCode: isValid };
  }

  private static generateTOTP(secret: string, window: number): string {
    try {
      const secretBuffer = this.base32Decode(secret);
      const timeBuffer = Buffer.alloc(8);
      timeBuffer.writeUInt32BE(0, 0);
      timeBuffer.writeUInt32BE(window, 4);

      const hmac = crypto.createHmac('sha1', secretBuffer);
      hmac.update(timeBuffer);
      const digest = hmac.digest();

      const offset = digest[digest.length - 1] & 0x0f;
      const code = ((digest[offset] & 0x7f) << 24) |
                   ((digest[offset + 1] & 0xff) << 16) |
                   ((digest[offset + 2] & 0xff) << 8) |
                   (digest[offset + 3] & 0xff);

      return (code % 1000000).toString().padStart(6, '0');
    } catch (error) {
      console.error('TOTP generation failed:', error);
      return '000000';
    }
  }

  private static base32Encode(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    let bits = 0;
    let value = 0;

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;

      while (bits >= 5) {
        result += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      result += alphabet[(value << (5 - bits)) & 31];
    }

    return result;
  }

  private static base32Decode(encoded: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleanEncoded = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
    
    let bits = 0;
    let value = 0;
    const result: number[] = [];

    for (let i = 0; i < cleanEncoded.length; i++) {
      const index = alphabet.indexOf(cleanEncoded[i]);
      if (index === -1) continue;

      value = (value << 5) | index;
      bits += 5;

      if (bits >= 8) {
        result.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }

    return Buffer.from(result);
  }
}