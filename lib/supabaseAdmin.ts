import { createClient } from '@supabase/supabase-js';

// ✅ Environment variable safety
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ❌ Hard fail als keys missen
if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL is missing');
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is missing');
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
}

// ✅ Validatie format
try {
  new URL(supabaseUrl);
} catch (err) {
  console.error('❌ Invalid Supabase URL:', supabaseUrl);
  throw new Error('Invalid NEXT_PUBLIC_SUPABASE_URL format');
}

if (!supabaseServiceKey.startsWith('eyJ')) {
  console.error('❌ Invalid service key format (expected JWT)');
  throw new Error('Invalid SUPABASE_SERVICE_ROLE_KEY format');
}

// ✅ Logging zonder gevoelige data
console.log('🔧 Supabase Admin initialized:', {
  url: supabaseUrl.substring(0, 30) + '...',
  serviceKeyPrefix: supabaseServiceKey.substring(0, 10) + '...',
  timestamp: new Date().toISOString()
});

// 🔐 Client config
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        'X-Client-Info': 'fullforce-ai-admin',
        'X-Requested-With': 'CRON'
      }
    },
    db: {
      schema: 'public'
    }
  }
);

// 🧪 Optionele helper voor testen
export async function testDocumentDownload(storagePath: string) {
  try {
    const { data, error } = await supabaseAdmin
      .storage
      .from('company-docs')
      .download(storagePath);

    if (error) {
      return {
        success: false,
        error: error.message,
        details: error
      };
    }

    return {
      success: true,
      fileSize: data?.size || 0,
      fileType: data?.type || 'unknown'
    };
  } catch (err) {
    const error = err as Error;
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}
