// Enhanced Supabase client with better configuration
import { createClient } from '@supabase/supabase-js';
import { Logger } from '../utils/logger';

const logger = new Logger('SupabaseClient');

// Validate environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
}

// Validate URL format
try {
  new URL(supabaseUrl);
} catch {
  throw new Error('Invalid NEXT_PUBLIC_SUPABASE_URL format');
}

// Enhanced client configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
      'X-Requested-With': 'XMLHttpRequest',
      'X-Client-Version': '1.0.0'
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
});

// Enhanced auth state monitoring
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    const userEmail = session?.user?.email || 'anonymous';
    
    logger.info(`Auth state changed: ${event}`, {
      userEmail,
      hasSession: !!session,
      expiresAt: session?.expires_at
    });

    // Handle specific auth events
    switch (event) {
      case 'SIGNED_IN':
        logger.info('User signed in successfully', { userEmail });
        break;
      case 'SIGNED_OUT':
        logger.info('User signed out', { userEmail });
        break;
      case 'TOKEN_REFRESHED':
        logger.debug('Auth token refreshed', { userEmail });
        break;
      case 'USER_UPDATED':
        logger.info('User data updated', { userEmail });
        break;
      case 'PASSWORD_RECOVERY':
        logger.info('Password recovery initiated', { userEmail });
        break;
    }
  });

  // Monitor connection status
  supabase.realtime.onOpen(() => {
    logger.info('Realtime connection opened');
  });

  supabase.realtime.onClose(() => {
    logger.warn('Realtime connection closed');
  });

  supabase.realtime.onError((error) => {
    logger.error('Realtime connection error', {}, error);
  });
}

// Connection health check
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);

    if (error) {
      logger.error('Database connection check failed', {}, new Error(error.message));
      return false;
    }

    logger.debug('Database connection check passed');
    return true;
  } catch (error) {
    logger.error('Database connection check error', {}, error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

// Export for backward compatibility
export { supabase as supabaseClient };