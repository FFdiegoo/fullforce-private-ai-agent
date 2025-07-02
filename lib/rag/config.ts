// RAG Configuration

// Supabase configuration
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// OpenAI configuration
export const openaiApiKey = process.env.OPENAI_API_KEY || '';

// Import Supabase client
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// RAG configuration
export const RAG_CONFIG = {
  embeddingModel: 'text-embedding-ada-002',
  chunkSize: 500,
  chunkOverlap: 50,
  similarityThreshold: 0.7,
  maxResults: 5
};