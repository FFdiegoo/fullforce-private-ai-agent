import * as crypto from 'crypto';
import qrcode from 'qrcode'; 

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