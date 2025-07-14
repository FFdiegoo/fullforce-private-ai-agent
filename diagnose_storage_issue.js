#!/usr/bin/env node

/**
 * Supabase Storage Issue Diagnostic Script
 * 
 * Diagnose Supabase Storage download problemen stap-voor-stap.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// CONFIGURATIE
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  STORAGE_BUCKET: 'company-docs'
};

// ✅ Timestamp + check config direct
console.log('🔍 Supabase Storage Issue Diagnostic');
console.log('====================================');
console.log(`🕒 Timestamp: ${new Date().toISOString()}`);

// 🔧 Validatie .env configuratie
function validateConfig() {
  const issues = [];

  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_URL.startsWith('https://')) {
    issues.push('❌ Invalid or missing SUPABASE_URL');
  } else {
    console.log('✅ SUPABASE_URL is valid');
  }

  if (!CONFIG.SUPABASE_ANON_KEY || !CONFIG.SUPABASE_ANON_KEY.startsWith('eyJ')) {
    issues.push('❌ Invalid or missing SUPABASE_ANON_KEY');
  } else {
    console.log('✅ SUPABASE_ANON_KEY is valid');
  }

  if (!CONFIG.SUPABASE_SERVICE_KEY || !CONFIG.SUPABASE_SERVICE_KEY.startsWith('eyJ')) {
    issues.push('❌ Invalid or missing SUPABASE_SERVICE_ROLE_KEY');
  } else {
    console.log('✅ SUPABASE_SERVICE_ROLE_KEY is valid');
  }

  if (issues.length > 0) {
    console.log('\n🚨 Config Issues:');
    issues.forEach(issue => console.log(issue));
    return false;
  }

  return true;
}

async function testStorageAccess() {
  console.log('\n📋 Test 1: Storage Bucket Access');
  const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY);

  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    console.log(`❌ Cannot list buckets: ${error.message}`);
    return false;
  }

  console.log(`✅ ${buckets.length} bucket(s) gevonden: ${buckets.map(b => b.name).join(', ')}`);
  const bucket = buckets.find(b => b.name === CONFIG.STORAGE_BUCKET);
  if (!bucket) {
    console.log(`❌ Bucket "${CONFIG.STORAGE_BUCKET}" bestaat niet`);
    return false;
  }

  console.log(`✅ Bucket "${CONFIG.STORAGE_BUCKET}" bestaat en is toegankelijk`);
  return true;
}

async function testDocumentsMetadata() {
  console.log('\n📋 Test 2: Query documents_metadata');

  const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase
    .from('documents_metadata')
    .select('id, filename, storage_path, ready_for_indexing, processed, last_error')
    .eq('ready_for_indexing', true)
    .eq('processed', false)
    .limit(10);

  if (error) {
    console.log(`❌ Fout bij query: ${error.message}`);
    return [];
  }

  console.log(`✅ ${data.length} documenten gevonden klaar voor verwerking`);
  data.forEach((doc, i) => {
    console.log(`   ${i + 1}. ${doc.filename} → ${doc.storage_path}`);
    if (doc.last_error) {
      console.log(`      ⚠️ Last error: ${doc.last_error}`);
    }
  });

  return data;
}

async function testFileDownloads(documents) {
  console.log('\n📋 Test 3: File Downloads');

  const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY);
  const tests = documents.slice(0, 3);

  for (const doc of tests) {
    const raw = doc.storage_path;
    const path = raw.startsWith('/') ? raw.slice(1) : raw;
    console.log(`\n🔄 ${doc.filename}`);
    console.log(`   Path: ${path}`);

    const { data, error } = await supabase.storage
      .from(CONFIG.STORAGE_BUCKET)
      .download(path);

    if (error) {
      console.log(`   ❌ Download error: ${error.message}`);
    } else {
      console.log(`   ✅ Bestand gedownload (${data.size} bytes)`);

      try {
        const text = await data.text();
        console.log(`   📄 Text: ${text.slice(0, 80).replace(/\s+/g, ' ')}...`);
      } catch (e) {
        console.log(`   ⚠️ Kon geen tekst extraheren: ${e.message}`);
      }
    }
  }
}

async function testStoragePolicies() {
  console.log('\n📋 Test 4: RLS & Policy Check');

  const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase.storage
    .from(CONFIG.STORAGE_BUCKET)
    .list('', { limit: 1 });

  if (error) {
    console.log(`❌ Bucket lijst mislukt: ${error.message}`);
    console.log('   ➤ Controleer of service_role toegang heeft via RLS policy.');
  } else {
    console.log('✅ Bucket inhoud is toegankelijk via service_role');
  }
}

async function generateSummary() {
  console.log('\n📊 Samenvatting & Advies');
  console.log('=========================');
  console.log('✔️  Voer "node diagnose_storage_issue.js" opnieuw uit na fixes');
  console.log('✔️  Controleer ook Supabase logs bij twijfel');
  console.log('✔️  Upload een nieuw testdocument indien geen matches gevonden');
}

async function main() {
  if (!validateConfig()) {
    process.exit(1);
  }

  const bucketAccess = await testStorageAccess();
  const documents = await testDocumentsMetadata();

  if (bucketAccess && documents.length > 0) {
    await testFileDownloads(documents);
  }

  if (bucketAccess) {
    await testStoragePolicies();
  }

  await generateSummary();
  console.log('\n🏁 Diagnose voltooid');
}

main();
