import { z } from 'zod';
import { emailSchema, uuidSchema, paginationSchema } from './common';

// Admin validation schemas
export const adminActionSchema = z.object({
  action: z.enum(['create_user', 'delete_user', 'update_role', 'reset_2fa', 'disable_user']),
  targetUserId: uuidSchema.optional(),
  targetEmail: emailSchema.optional(),
  metadata: z.record(z.any()).optional()
});

export const userManagementSchema = z.object({
  userId: uuidSchema,
  action: z.enum(['reset_2fa', 'change_role', 'disable', 'enable']),
  newRole: z.enum(['user', 'admin']).optional()
});

export const auditLogFilterSchema = z.object({
  userId: uuidSchema.optional(),
  action: z.string().optional(),
  severity: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
}).merge(paginationSchema);

export const securityScanSchema = z.object({
  scanType: z.enum(['dependencies', 'code', 'full']).default('full')
});

export const errorMonitoringSchema = z.object({
  type: z.enum(['test', 'critical', 'auth']).default('test'),
  message: z.string().max(500, 'Message too long').default('Test error from admin panel')
});

// Type exports
export type AdminActionRequest = z.infer<typeof adminActionSchema>;
export type UserManagementRequest = z.infer<typeof userManagementSchema>;
export type AuditLogFilterRequest = z.infer<typeof auditLogFilterSchema>;
export type SecurityScanRequest = z.infer<typeof securityScanSchema>;
export type ErrorMonitoringRequest = z.infer<typeof errorMonitoringSchema>;