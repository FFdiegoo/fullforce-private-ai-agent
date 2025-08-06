import { z } from 'zod';
import { FILE_UPLOAD } from '../constants';

// Upload validation schemas
export const fileUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required').max(255, 'Filename too long'),
  size: z.number()
    .min(1, 'File cannot be empty')
    .max(FILE_UPLOAD.maxFileSize, `File size must be less than ${FILE_UPLOAD.maxFileSize / (1024 * 1024 * 1024)}GB`),
  mimetype: z.string().refine(
    (type) => FILE_UPLOAD.supportedTypes.includes(type),
    'Unsupported file type'
  )
});

export const uploadMetadataSchema = z.object({
  department: z.string().min(1, 'Department is required').max(100, 'Department name too long').optional(),
  category: z.string().min(1, 'Category is required').max(100, 'Category name too long').optional(),
  subject: z.string().min(1, 'Subject is required').max(200, 'Subject too long').optional(),
  description: z.string().max(1000, 'Description too long').optional()
});

export const documentFilterSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSED', 'FAILED']).optional(),
  embeddingStatus: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  department: z.string().optional(),
  category: z.string().optional(),
  uploadedBy: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0)
});

export const documentActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'reprocess']),
  documentIds: z.array(z.string().uuid()).min(1, 'At least one document ID required')
});

// Type exports
export type FileUploadValidation = z.infer<typeof fileUploadSchema>;
export type UploadMetadataRequest = z.infer<typeof uploadMetadataSchema>;
export type DocumentFilterRequest = z.infer<typeof documentFilterSchema>;
export type DocumentActionRequest = z.infer<typeof documentActionSchema>;