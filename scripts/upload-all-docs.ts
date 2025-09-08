import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load env vars from .env and .env.local if present
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_DOCUMENTS_BUCKET || 'documents';
const ROOT = process.env.LOCAL_DOCUMENTS_PATH || process.argv[2];

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials.');
  process.exit(1);
}

if (!ROOT) {
  console.error('❌ Please provide a directory to scan.');
  console.error('   Usage: ts-node scripts/upload-all-docs.ts <directory>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function walk(dir: string, base: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, base);
    } else {
      const storagePath = path.relative(base, fullPath).replace(/\\/g, '/');
      try {
        const file = await fs.readFile(fullPath);
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, file, { upsert: false });
        if (error) {
          console.error(`⚠️  Failed to upload ${storagePath}: ${error.message}`);
        } else {
          console.log(`✅ Uploaded ${storagePath}`);
        }
      } catch (err: any) {
        console.error(`⚠️  Error reading ${fullPath}: ${err.message}`);
      }
    }
  }
}

walk(ROOT, ROOT)
  .then(() => console.log('🎉 Upload complete'))
  .catch(err => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  });
