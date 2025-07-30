// Database types for RAG Pipeline
// Auto-generated from Prisma schema

export interface Document {
  id: string;
  filename: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  uploadPath: string;
  status: DocumentStatus;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  // RAG Pipeline Required Fields
  safe_filename: string;
  file_size: number;
  content_type: string;
  upload_date: Date;
  processed_date?: Date;
  embedding_status: EmbeddingStatus;
  chunk_count?: number;
  content?: string;
  summary?: string;
  metadata?: any;

  // Metadata
  department?: string;
  category?: string;
  subject?: string;
  description?: string;

  // Relations
  uploadedBy: string;
  chunks?: DocumentChunk[];
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding?: string;
  metadata?: any;
  created_at: Date;
  document?: Document; // Optional relation
}

// Type for DocumentChunk with loaded document relation
export interface DocumentChunkWithDocument {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding?: string;
  metadata?: any;
  created_at: Date;
  document: {
    id: string;
    filename: string;
    safe_filename: string;
    content_type: string;
    upload_date: Date;
  };
}

export interface User {
  id: string;
  email: string;
  name?: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatSession {
  id: string;
  userId: string;
  messages: any;
  createdAt: Date;
}

export interface AuthEvent {
  id: string;
  userId: string;
  eventType: string;
  createdAt: Date;
}

export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN'
}

export enum DocumentStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED'
}

export enum EmbeddingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

// RAG Pipeline specific types
export interface RAGDocument {
  id: string;
  safe_filename: string;
  file_size: number;
  content_type: string;
  upload_date: Date;
  processed_date?: Date;
  embedding_status: EmbeddingStatus;
  chunk_count?: number;
  content?: string;
  summary?: string;
  is_ready_for_search: boolean;
}

export interface DocumentProcessingRequest {
  document_id: string;
  safe_filename: string;
  content_type: string;
  file_size: number;
}

export interface EmbeddingRequest {
  document_id: string;
  chunks: {
    index: number;
    content: string;
    metadata?: any;
  }[];
}

export interface SearchRequest {
  query: string;
  limit?: number;
  threshold?: number;
  filter?: {
    content_type?: string;
    user_id?: string;
    embedding_status?: EmbeddingStatus;
  };
}

export interface SearchResult {
  document_id: string;
  chunk_id: string;
  chunk_index: number;
  content: string;
  similarity_score: number;
  metadata?: any;
  document_info: {
    filename: string;
    safe_filename: string;
    content_type: string;
    upload_date: Date;
  };
}