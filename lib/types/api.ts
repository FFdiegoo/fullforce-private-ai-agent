// API-specific types
import { z } from 'zod';

// Request/Response types for API endpoints
export interface ChatRequest {
  prompt: string;
  mode: 'technical' | 'procurement';
  model: 'simple' | 'complex';
  sessionId?: string;
}

export interface ChatResponse {
  reply: string;
  modelUsed: string;
  contextUsed: boolean;
  sources?: DocumentSource[];
  documentsSearched: number;
  processingInfo: {
    embeddingGenerated: boolean;
    vectorSearchPerformed: boolean;
    contextLength: number;
    relevanceThreshold: number;
  };
}

export interface DocumentSource {
  documentId: string;
  filename: string;
  chunkIndex: number;
  similarityScore: number;
  contentPreview: string;
  afdeling?: string;
  categorie?: string;
}

export interface UploadRequest {
  file: File;
  department?: string;
  category?: string;
  subject?: string;
}

export interface UploadResponse {
  documentId: string;
  filename: string;
  safeFilename: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  readyForIndexing: boolean;
  uploadedAt: string;
}

// Validation schemas
export const chatRequestSchema = z.object({
  prompt: z.string().min(1).max(10000),
  mode: z.enum(['technical', 'procurement']),
  model: z.enum(['simple', 'complex']).default('simple'),
  sessionId: z.string().uuid().optional()
});

export const uploadRequestSchema = z.object({
  department: z.string().optional(),
  category: z.string().optional(),
  subject: z.string().optional()
});

export type ChatRequestValidated = z.infer<typeof chatRequestSchema>;
export type UploadRequestValidated = z.infer<typeof uploadRequestSchema>;