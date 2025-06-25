import { z } from 'zod';

// Common validation schemas
export const emailSchema = z.string().email('Invalid email format');
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');
export const uuidSchema = z.string().uuid('Invalid UUID format');

// File upload validation
export const fileUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  size: z.number().max(1024 * 1024 * 1024, 'File size must be less than 1GB'),
  mimetype: z.string().refine(
    (type) => {
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png',
        'image/gif'
      ];
      return allowedTypes.includes(type);
    },
    'Invalid file type'
  )
});

// Chat message validation
export const chatMessageSchema = z.object({
  prompt: z.string().min(1, 'Message cannot be empty').max(10000, 'Message too long'),
  mode: z.enum(['technical', 'procurement'], { required_error: 'Mode is required' }),
  model: z.enum(['simple', 'complex']).optional()
});

// User profile validation
export const userProfileSchema = z.object({
  email: emailSchema,
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  role: z.enum(['user', 'admin']).default('user'),
  phone: z.string().optional()
});

// 2FA validation
export const twoFactorSchema = z.object({
  secret: z.string().min(16, 'Invalid secret'),
  token: z.string().length(6, 'Token must be 6 digits').regex(/^\d+$/, 'Token must be numeric'),
  backupCodes: z.array(z.string()).min(1, 'Backup codes required')
});

// Admin action validation
export const adminActionSchema = z.object({
  action: z.enum(['create_user', 'delete_user', 'update_role', 'reset_2fa']),
  targetUserId: uuidSchema.optional(),
  targetEmail: emailSchema.optional(),
  metadata: z.record(z.any()).optional()
});

// Rate limit validation
export const rateLimitSchema = z.object({
  identifier: z.string().min(1, 'Identifier required'),
  type: z.enum(['auth', 'upload', 'chat', 'admin', 'general']).default('general')
});

export class InputValidator {
  static sanitizeString(input: string): string {
    // Remove potentially dangerous characters
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  static sanitizeFilename(filename: string): string {
    // Remove path traversal attempts and dangerous characters
    return filename
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\.\./g, '_')
      .replace(/^\.+/, '')
      .substring(0, 255);
  }

  static validateAndSanitize<T>(schema: z.ZodSchema<T>, data: any): {
    success: boolean;
    data?: T;
    errors?: string[];
  } {
    try {
      const result = schema.parse(data);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
        };
      }
      return {
        success: false,
        errors: ['Validation failed']
      };
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
    // Basic file signature validation
    const signatures: Record<string, number[][]> = {
      'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
      'image/jpeg': [[0xFF, 0xD8, 0xFF]], // JPEG
      'image/png': [[0x89, 0x50, 0x4E, 0x47]], // PNG
      'application/zip': [[0x50, 0x4B, 0x03, 0x04]], // ZIP
    };

    const fileSignatures = signatures[expectedMimeType];
    if (!fileSignatures) return true; // Allow if no signature defined

    return fileSignatures.some(signature => {
      if (buffer.length < signature.length) return false;
      return signature.every((byte, index) => buffer[index] === byte);
    });
  }
}

// Export validation middleware
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    const validation = InputValidator.validateAndSanitize(schema, req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: validation.errors
      });
    }

    req.validatedData = validation.data;
    next();
  };
}