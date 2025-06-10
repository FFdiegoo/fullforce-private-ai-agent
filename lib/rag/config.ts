import { createClient } from '@supabase/supabase-js';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing env.OPENAI_API_KEY');
}

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const openaiApiKey = process.env.OPENAI_API_KEY;
export const openaiModel = process.env.OPENAI_MODEL || 'gpt-4-turbo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const RAG_CONFIG = {
  chunkSize: 500,
  chunkOverlap: 50,
  embeddingModel: 'text-embedding-ada-002',
  skipExisting: true, // zorgt ervoor dat documenten niet opnieuw worden verwerkt
};
