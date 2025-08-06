// Security utilities
import crypto from 'crypto';
import { Logger } from './logger';

export class SecurityUtils {
  private static logger = new Logger('SecurityUtils');

  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  static generateSecurePassword(length: number = 16): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      password += charset[randomIndex];
    }
    
    return password;
  }

  static hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, actualSalt, 10000, 64, 'sha512').toString('hex');
    
    return { hash, salt: actualSalt };
  }

  static verifyPassword(password: string, hash: string, salt: string): boolean {
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
  }

  static generateCSRFToken(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  static verifyCSRFToken(token: string, sessionToken: string): boolean {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(token, 'base64'),
        Buffer.from(sessionToken, 'base64')
      );
    } catch {
      return false;
    }
  }

  static sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  }

  static isValidIP(ip: string): boolean {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  static maskSensitiveData(data: Record<string, any>): Record<string, any> {
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization'];
    const masked = { ...data };

    Object.keys(masked).forEach(key => {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        if (typeof masked[key] === 'string' && masked[key].length > 0) {
          masked[key] = `${masked[key].substring(0, 4)}****${masked[key].substring(masked[key].length - 4)}`;
        } else {
          masked[key] = '****';
        }
      }
    });

    return masked;
  }

  static generateRequestId(): string {
    return `req_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  static rateLimit = {
    createKey: (identifier: string, endpoint: string): string => {
      return `rate_limit:${endpoint}:${identifier}`;
    },
    
    isBlocked: (attempts: number, maxAttempts: number): boolean => {
      return attempts >= maxAttempts;
    },
    
    calculateResetTime: (windowMs: number): number => {
      return Date.now() + windowMs;
    }
  };

  static audit = {
    shouldLog: (action: string): boolean => {
      const criticalActions = [
        'LOGIN', 'LOGOUT', 'SIGNUP', '2FA_SETUP', '2FA_DISABLE',
        'ADMIN_ACTION', 'DOCUMENT_UPLOAD', 'DOCUMENT_DELETE',
        'RATE_LIMIT_EXCEEDED', 'SECURITY_VIOLATION'
      ];
      
      return criticalActions.some(critical => action.includes(critical));
    },
    
    maskUserData: (userData: Record<string, any>): Record<string, any> => {
      const { password, twoFactorSecret, backupCodes, ...safeData } = userData;
      return safeData;
    }
  };
}