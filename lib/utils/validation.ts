// Input validation and sanitization utilities
import { z } from 'zod';
import { ValidationError } from './errors';

export class ValidationUtils {
  static sanitizeString(input: string): string {
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\.\./g, '_')
      .replace(/^\.+/, '')
      .substring(0, 255);
  }

  static validateAndParse<T>(schema: z.ZodSchema<T>, data: unknown): T {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors
          .map(err => `${err.path.join('.')}: ${err.message}`)
          .join(', ');
        throw new ValidationError(`Validation failed: ${errorMessage}`);
      }
      throw new ValidationError('Validation failed');
    }
  }

  static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static detectSQLInjection(input: string): boolean {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
      /(--|\/\*|\*\/|;)/,
      /(\b(OR|AND)\b.*=.*)/i,
      /'.*'/,
      /\b(SCRIPT|JAVASCRIPT|VBSCRIPT)\b/i
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  static detectXSS(input: string): boolean {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe/gi,
      /<object/gi,
      /<embed/gi,
      /<link/gi,
      /<meta/gi
    ];

    return xssPatterns.some(pattern => pattern.test(input));
  }

  static validateFileContent(buffer: Buffer, expectedMimeType: string): boolean {
    const signatures: Record<string, number[][]> = {
      'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
      'image/jpeg': [[0xFF, 0xD8, 0xFF]], // JPEG
      'image/png': [[0x89, 0x50, 0x4E, 0x47]], // PNG
      'application/zip': [[0x50, 0x4B, 0x03, 0x04]], // ZIP
    };

    const fileSignatures = signatures[expectedMimeType];
    if (!fileSignatures) return true;

    return fileSignatures.some(signature => {
      if (buffer.length < signature.length) return false;
      return signature.every((byte, index) => buffer[index] === byte);
    });
  }
}

// Validation middleware factory
export function createValidationMiddleware<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): T => {
    return ValidationUtils.validateAndParse(schema, data);
  };
}