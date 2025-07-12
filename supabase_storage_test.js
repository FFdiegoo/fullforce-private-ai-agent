#!/usr/bin/env node

/**
 * Supabase Storage Diagnostic Test (voor Full Force AI)
 * 
 * Controleert of storage access, buckets en bestanden correct werken
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config(); // .env laden

// ✅ Configuratie via echte .env values
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  STORAGE_BUCKET: 'company-docs'
};

// ❗ Validatie check
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY || !CONFIG.SUPABASE_SERVICE_KEY) {
  console.error('\n❌ ERROR: Een of meerdere SUPABASE env vars ontbreken. Controleer je .env.local!');
  process.exit(1);
}

console.log('🔍 Supabase Storage Diagnostic Test');
console.log('=====================================');
console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
console.log(`🔑 Anon Key: ${CONFIG.SUPABASE_ANON_KEY.slice(0, 8)}...`);
console.log(`🔑 Service Key: ${CONFIG.SUPABASE_SERVICE_KEY.slice(0, 8)}...`);
console.log(`🪣 Bucket: ${CONFIG.STORAGE_BUCKET}\n`);

async function testSupabaseStorage() {
  try {
    // Test 1: Regular client (anon key)
    console.log('📋 Test 1: Anon Supabase Client');
    const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

    const { data: buckets1, error: bucketsError1 } = await supabase.storage.listBuckets();
    if (bucketsError1) {
      console.log(`❌ Buckets (anon): ${bucketsError1.message}`);
    } else {
      console.log(`✅ Anon buckets zichtbaar: ${buckets1.map(b => b.name).join(', ')}`);
    }

    // Test 2: Admin client (service role key)
    console.log('\n📋 Test 2: Admin Supabase Client');
    const supabaseAdmin = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: buckets2, error: bucketsError2 } = await supabaseAdmin.storage.listBuckets();
    if (bucketsError2) {
      console.log(`❌ Buckets (admin): ${bucketsError2.message}`);
    } else {
      console.log(`✅ Admin buckets zichtbaar: ${buckets2.map(b => b.name).join(', ')}`);

      const found = buckets2.find(b => b.name === CONFIG.STORAGE_BUCKET);
      if (found) {
        console.log(`✅ Bucket '${CONFIG.STORAGE_BUCKET}' gevonden\n`);
      } else {
        console.log(`❌ Bucket '${CONFIG.STORAGE_BUCKET}' NIET gevonden!\n`);
      }
    }

    // Test 3: List bestanden in bucket
    console.log('📋 Test 3: Bestanden in bucket tonen');
    const { data: files, error: filesError } = await supabaseAdmin
      .storage
      .from(CONFIG.STORAGE_BUCKET)
      .list('', { limit: 10 });

    if (filesError) {
      console.log(`❌ Lijst mislukt: ${filesError.message}`);
    } else {
      console.log(`✅ ${files.length} bestanden/folders gevonden:`);
      files.forEach(file => {
        console.log(`   - ${file.name} (${file.updated_at || 'onbekend'})`);
      });
    }

    // Test 4: Onverwerkte documenten ophalen
    console.log('\n📋 Test 4: documents_metadata ophalen');
    const { data: documents, error: docsError } = await supabaseAdmin
      .from('documents_metadata')
      .select('id, filename, storage_path')
      .eq('ready_for_indexing', true)
      .eq('processed', false)
      .limit(1);

    if (docsError) {
      console.log(`❌ Query documents_metadata: ${docsError.message}`);
    } else if (documents.length === 0) {
      console.log('ℹ️ Geen documenten klaar voor verwerking');
    } else {
      const doc = documents[0];
      console.log(`✅ Document gevonden: ${doc.filename} (${doc.storage_path})`);

      // Test 5: Download poging
      console.log('\n📋 Test 5: Download poging');
      const path = doc.storage_path.startsWith('/') ? doc.storage_path.slice(1) : doc.storage_path;

      const { data: fileData, error: downloadError } = await supabaseAdmin
        .storage
        .from(CONFIG.STORAGE_BUCKET)
        .download(path);

      if (downloadError) {
        console.log(`❌ Download fout: ${downloadError.message || JSON.stringify(downloadError)}`);
      } else {
        console.log(`✅ Download gelukt! Bestandsgrootte: ${fileData.size} bytes`);
      }
    }

  } catch (error) {
    console.error(`\n💥 Onverwachte fout: ${error.message}`);
    console.error(error.stack);
  }
}

testSupabaseStorage()
  .then(() => console.log('\n🏁 Test voltooid'))
  .catch(err => console.error('💥 Crash:', err.message));
