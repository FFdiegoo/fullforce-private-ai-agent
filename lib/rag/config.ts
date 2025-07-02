import { createClient } from '@supabase/supabase-js';

// Environment variables met betere error handling
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

// Validate critical environment variables
if (!supabaseUrl) {
  throw new Error('❌ NEXT_PUBLIC_SUPABASE_URL is required');
}

if (!supabaseAnonKey) {
  throw new Error('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
}

if (!openaiApiKey) {
  throw new Error('❌ OPENAI_API_KEY is required');
}

// Log successful configuration (zonder keys te tonen)
console.log('✅ RAG Config initialized successfully');
console.log('   Supabase URL:', supabaseUrl.substring(0, 30) + '...');
console.log('   OpenAI Key:', openaiApiKey ? 'Present' : 'Missing');

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const RAG_CONFIG = {
  chunkSize: 500,
  chunkOverlap: 50,
  embeddingModel: 'text-embedding-ada-002',
  skipExisting: true,
};

export { supabaseUrl, supabaseAnonKey, openaiApiKey };