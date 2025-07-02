import { createClient } from '@supabase/supabase-js';

// Safely access environment variables with fallbacks
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const openaiApiKey = process.env.OPENAI_API_KEY || '';

// Validate environment variables
if (!supabaseUrl) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseAnonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
}

if (!openaiApiKey) {
  console.error('Missing OPENAI_API_KEY environment variable');
}

// Initialize Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// RAG configuration
export const RAG_CONFIG = {
  embeddingModel: 'text-embedding-ada-002',
  chunkSize: 1000,
  chunkOverlap: 200,
  similarityThreshold: 0.7,
  maxResults: 5
};