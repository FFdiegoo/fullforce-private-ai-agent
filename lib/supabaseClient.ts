import { createClient } from '@supabase/supabase-js';

// Safely access environment variables with fallbacks
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Validate environment variables
if (!supabaseUrl) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseAnonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    },
    global: {
      headers: {
        'X-Client-Info': 'fullforce-ai-agent'
      }
    }
  }
);

// Add error handling for client initialization
supabase.auth.onAuthStateChange((event, session) => {
  console.log('🔐 Auth state changed:', event, session?.user?.email || 'no user');
  
  if (event === 'SIGNED_OUT') {
    console.log('👋 User signed out');
  } else if (event === 'SIGNED_IN') {
    console.log('👋 User signed in:', session?.user?.email);
  } else if (event === 'TOKEN_REFRESHED') {
    console.log('🔄 Token refreshed for:', session?.user?.email);
  }
});