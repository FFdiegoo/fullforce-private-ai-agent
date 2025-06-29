#!/usr/bin/env node

/**
 * Mark Documents for Indexing
 * 
 * This script marks documents in the "120 Handleidingen" folder as ready for indexing.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  TARGET_FOLDER: '120 Handleidingen'
};

// Validate configuration
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials. Please check your .env.local file.');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Main function
async function main() {
  console.log('🚀 Marking documents for indexing');
  console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`📁 Target folder: ${CONFIG.TARGET_FOLDER}`);
  console.log('');

  try {
    // Verify Supabase connection
    console.log('🔍 Verifying Supabase connection...');
    const { data, error } = await supabase
      .from('documents_metadata')
      .select('count')
      .limit(1);

    if (error) {
      throw new Error(`Supabase connection failed: ${error.message}`);
    }
    console.log('✅ Supabase connection verified');

    // Find documents that need to be marked for indexing
    console.log('🔍 Finding documents to mark...');
    const { data: documents, error: docsError } = await supabase
      .from('documents_metadata')
      .select('id, filename')
      .ilike('storage_path', `${CONFIG.TARGET_FOLDER}%`)
      .eq('ready_for_indexing', false);

    if (docsError) {
      throw new Error(`Failed to fetch documents: ${docsError.message}`);
    }

    if (!documents || documents.length === 0) {
      console.log('✅ No documents need to be marked for indexing');
      return;
    }

    console.log(`🔍 Found ${documents.length} documents to mark for indexing`);
    
    // Mark documents as ready for indexing
    console.log('🔄 Marking documents as ready for indexing...');
    const { error: updateError } = await supabase
      .from('documents_metadata')
      .update({ ready_for_indexing: true })
      .ilike('storage_path', `${CONFIG.TARGET_FOLDER}%`)
      .eq('ready_for_indexing', false);

    if (updateError) {
      throw new Error(`Failed to update documents: ${updateError.message}`);
    }

    console.log(`✅ Successfully marked ${documents.length} documents as ready for indexing`);
    console.log('');
    console.log('🚀 Next steps:');
    console.log('   1. Run the ingest script to process the documents:');
    console.log('      node scripts/ingest-handleidingen.js');
    console.log('   2. Check the admin dashboard to monitor processing status');

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Start the script
main().catch(console.error);