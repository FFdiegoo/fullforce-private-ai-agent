// Enhanced Supabase admin client
import { createClient } from '@supabase/supabase-js';
import { Logger } from '../utils/logger';

const logger = new Logger('SupabaseAdmin');

// Validate environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseServiceKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
}

// Validate formats
try {
  new URL(supabaseUrl);
} catch {
  throw new Error('Invalid NEXT_PUBLIC_SUPABASE_URL format');
}

if (!supabaseServiceKey.startsWith('eyJ')) {
  throw new Error('Invalid SUPABASE_SERVICE_ROLE_KEY format (expected JWT)');
}

// Log initialization (without sensitive data)
logger.info('Supabase Admin client initialized', {
  url: `${supabaseUrl.substring(0, 30)}...`,
  serviceKeyPrefix: `${supabaseServiceKey.substring(0, 10)}...`,
  timestamp: new Date().toISOString()
});

// Enhanced admin client configuration
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    headers: {
      'X-Client-Info': 'fullforce-ai-admin',
      'X-Requested-With': 'SERVER',
      'X-Client-Version': '1.0.0'
    }
  },
  db: {
    schema: 'public'
  }
});

// Admin-specific utilities
export class AdminDatabase {
  static async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('count')
        .limit(1);

      if (error) {
        return { success: false, error: error.message };
      }

      logger.info('Admin database connection test passed');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Admin database connection test failed', {}, new Error(errorMessage));
      return { success: false, error: errorMessage };
    }
  }

  static async getTableStats(): Promise<Record<string, number>> {
    try {
      const tables = [
        'profiles',
        'documents_metadata',
        'document_chunks',
        'chat_sessions',
        'chat_messages',
        'message_feedback',
        'auth_events',
        'audit_logs',
        'invites',
        'email_verifications'
      ];

      const stats: Record<string, number> = {};

      for (const table of tables) {
        try {
          const { count, error } = await supabaseAdmin
            .from(table)
            .select('*', { count: 'exact', head: true });

          if (error) {
            logger.warn(`Failed to get count for table ${table}`, {}, new Error(error.message));
            stats[table] = -1;
          } else {
            stats[table] = count || 0;
          }
        } catch (tableError) {
          logger.warn(`Error querying table ${table}`, {}, tableError instanceof Error ? tableError : new Error(String(tableError)));
          stats[table] = -1;
        }
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get table statistics', {}, error instanceof Error ? error : new Error(String(error)));
      return {};
    }
  }

  static async cleanupExpiredRecords(): Promise<{ cleaned: number; errors: string[] }> {
    const errors: string[] = [];
    let cleaned = 0;

    try {
      // Cleanup expired invites
      const { data: expiredInvites, error: inviteError } = await supabaseAdmin
        .from('invites')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .eq('used', false)
        .select('id');

      if (inviteError) {
        errors.push(`Invite cleanup failed: ${inviteError.message}`);
      } else {
        cleaned += expiredInvites?.length || 0;
      }

      // Cleanup expired email verifications
      const { data: expiredVerifications, error: verificationError } = await supabaseAdmin
        .from('email_verifications')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .eq('verified', false)
        .select('id');

      if (verificationError) {
        errors.push(`Email verification cleanup failed: ${verificationError.message}`);
      } else {
        cleaned += expiredVerifications?.length || 0;
      }

      logger.info('Database cleanup completed', { cleaned, errors: errors.length });

      return { cleaned, errors };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Database cleanup failed', {}, new Error(errorMessage));
      return { cleaned, errors: [errorMessage] };
    }
  }
}

// Export for backward compatibility
export { supabaseAdmin as supabaseAdminClient };