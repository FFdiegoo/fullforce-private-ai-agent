import { createClient } from '@supabase/supabase-js';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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