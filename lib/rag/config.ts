import { createClient } from '@supabase/supabase-js';

// Safely access environment variables with fallbacks
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const openaiApiKey = process.env.OPENAI_API_KEY || '';

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const RAG_CONFIG = {
  chunkSize: 500,
  chunkOverlap: 50,
  embeddingModel: 'text-embedding-ada-002',
  skipExisting: true, // zorgt ervoor dat documenten niet opnieuw worden verwerkt
};

export { supabaseUrl, supabaseAnonKey, openaiApiKey };