import { createClient } from '@supabase/supabase-js';

// Safely access environment variables with fallbacks
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
export const openaiApiKey = process.env.OPENAI_API_KEY || 'placeholder-key';

// Validate environment variables
if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co') {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseAnonKey || supabaseAnonKey === 'placeholder-key') {
  console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
}

if (!openaiApiKey || openaiApiKey === 'placeholder-key') {
  console.error('Missing OPENAI_API_KEY environment variable');
}

// Initialize Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// RAG configuration
export const RAG_CONFIG = {
  embeddingModel: 'text-embedding-3-small',
  chunkSize: 1000,
  chunkOverlap: 200,
  similarityThreshold: 0.7,
  maxResults: 5
};