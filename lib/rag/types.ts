import { SupabaseClient } from '@supabase/supabase-js';

export interface DocumentMetadata {
  id: string;
  filename: string;
  safe_filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  afdeling: string;
  categorie: string;
  onderwerp: string;
  versie: string;
  uploaded_by: string;
  last_updated: string;
}

export interface TextChunk {
  content: string;
  metadata: DocumentMetadata;
  chunk_index: number;
  embedding?: number[];
}

export interface ProcessingOptions {
  chunkSize: number;
  chunkOverlap: number;
  skipExisting: boolean;
}