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

export const ragConfig = {
  chunkSize: 1000,
  chunkOverlap: 200,
  skipExisting: true,
} as const;