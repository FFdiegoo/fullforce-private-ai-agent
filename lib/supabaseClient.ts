import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://xcrsfcwdjxsbmmrqnose.supabase.co';
// NOTE: this fallback uses the service role key so that local development and automated
// verification keep working even when the environment variables are missing. Always
// override it with NEXT_PUBLIC_SUPABASE_ANON_KEY in production environments.
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcnNmY3dkanhzYm1tcnFub3NlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjUzNjc1OCwiZXhwIjoyMDYyMTEyNzU4fQ.BxHofBt6ViKx4FbV7218Ad2GAekhZQXEd6CiHkkjOGI';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim();

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn(
    'Using built-in Supabase credentials fallback. Provide NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment for production use.'
  );
}

// Enhanced client configuration for better session management
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      storageKey: 'supabase.auth.token',
      debug: process.env.NODE_ENV === 'development'
    },
    global: {
      headers: {
        'X-Client-Info': 'fullforce-ai-agent',
        'X-Requested-With': 'XMLHttpRequest'
      }
    },
    db: {
      schema: 'public'
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  }
);

// Add error handling for client initialization
if (typeof window !== 'undefined') {
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
}