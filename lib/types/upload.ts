// Upload and document types
export interface Document {
  id: string;
  filename: string;
  safeFilename: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  contentType: string;
  storagePath: string;
  uploadPath: string;
  status: DocumentStatus;
  embeddingStatus: EmbeddingStatus;
  processedAt?: Date;
  uploadDate: Date;
  processedDate?: Date;
  chunkCount?: number;
  content?: string;
  summary?: string;
  metadata?: DocumentMetadata;
  department?: string;
  category?: string;
  subject?: string;
  description?: string;
  uploadedBy: string;
  userId: string;
  readyForIndexing: boolean;
  processed: boolean;
  lastError?: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  embedding?: string | number[];
  metadata?: ChunkMetadata;
  createdAt: Date;
}

export interface DocumentMetadata {
  originalFilename: string;
  uploadedAt: string;
  uploadedBy: string;
  checksum?: string;
  uploadMethod?: string;
  [key: string]: any;
}

export interface ChunkMetadata {
  documentId: string;
  filename: string;
  chunkIndex: number;
  totalChunks: number;
  fileSize: number;
  mimeType: string;
  afdeling?: string;
  categorie?: string;
  onderwerp?: string;
  startChar?: number;
  endChar?: number;
}

export type DocumentStatus = 'PENDING' | 'PROCESSED' | 'FAILED';
export type EmbeddingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface UploadProgress {
  fileId: string;
  filename: string;
  progress: number;
  status: UploadStatus;
  speed?: number;
  eta?: number;
  error?: string;
}

export type UploadStatus = 'pending' | 'uploading' | 'processing' | 'completed' | 'error';

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}