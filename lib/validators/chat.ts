import { z } from 'zod';
import { uuidSchema } from './common';

// Chat validation schemas
export const chatMessageSchema = z.object({
  prompt: z.string()
    .min(1, 'Message cannot be empty')
    .max(10000, 'Message too long')
    .transform(str => str.trim()),
  mode: z.enum(['technical', 'procurement'], { 
    required_error: 'Mode is required' 
  }),
  model: z.enum(['simple', 'complex']).default('simple'),
  sessionId: uuidSchema.optional()
});

export const createSessionSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  mode: z.enum(['technical', 'procurement'])
});

export const messageFeedbackSchema = z.object({
  messageId: uuidSchema,
  sessionId: uuidSchema,
  feedbackType: z.enum(['thumbs_up', 'thumbs_down'])
});

export const sessionFilterSchema = z.object({
  mode: z.enum(['technical', 'procurement']).optional(),
  userId: uuidSchema.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0)
});

// Type exports
export type ChatMessageRequest = z.infer<typeof chatMessageSchema>;
export type CreateSessionRequest = z.infer<typeof createSessionSchema>;
export type MessageFeedbackRequest = z.infer<typeof messageFeedbackSchema>;
export type SessionFilterRequest = z.infer<typeof sessionFilterSchema>;