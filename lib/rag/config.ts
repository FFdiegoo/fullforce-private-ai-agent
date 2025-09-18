import { createClient } from '@supabase/supabase-js';

const toInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloat = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Safely access environment variables with fallbacks
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
export const openaiApiKey = process.env.OPENAI_API_KEY || '';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
}

if (!openaiApiKey) {
  console.error('Missing OPENAI_API_KEY environment variable');
}

// Initialize Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const RAG_CONFIG = {
  embeddingModel: process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small',
  chunkSize: toInt(process.env.RAG_CHUNK_SIZE, 1000),
  chunkOverlap: toInt(process.env.RAG_CHUNK_OVERLAP, 200),
  similarityThreshold: toFloat(process.env.RAG_SIMILARITY_THRESHOLD, 0.7),
  maxResults: toInt(process.env.RAG_MAX_RESULTS, 5),
  batchSize: toInt(process.env.RAG_BATCH_SIZE, 20),
  concurrency: Math.max(1, toInt(process.env.RAG_CONCURRENCY, 2)),
  delayMs: Math.max(0, toInt(process.env.RAG_DELAY_MS, 200)),
  ocrMinTextLength: Math.max(0, toInt(process.env.OCR_MIN_TEXT_LEN, 50)),
  retryMax: Math.max(1, toInt(process.env.RETRY_MAX, 5)),
  documentsBucket: process.env.SUPABASE_DOCUMENTS_BUCKET || '',
};

export const EMBEDDING_DIMENSIONS = 1536;