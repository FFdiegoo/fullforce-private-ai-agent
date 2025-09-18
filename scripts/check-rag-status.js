#!/usr/bin/env node

/**
 * Check RAG Status Script
 * 
 * This script checks the status of the RAG system, including:
 * - Document processing status
 * - Vector embeddings
 * - Database health
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  TARGET_FOLDER: '120 Handleidingen',
  CRON_URL:
    process.env.CRON_URL ||
    'https://fullforce-private-ai-agent.vercel.app/api/cron/process-unindexed-documents?limit=1',
};

// Validate configuration
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials. Please check your .env.local file.');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Run the cron endpoint to process at least one document
async function runCron() {
  const headers = {};
  if (process.env.CRON_API_KEY) {
    headers['x-api-key'] = process.env.CRON_API_KEY;
  } else if (process.env.CRON_BYPASS_KEY) {
    headers['x-cron-key'] = process.env.CRON_BYPASS_KEY;
  } else {
    console.warn('⚠️ No CRON_API_KEY or CRON_BYPASS_KEY configured; skipping cron run');
    return;
  }

  console.log(`🚀 Triggering CRON endpoint: ${CONFIG.CRON_URL}`);
  const res = await fetch(CONFIG.CRON_URL, { headers });
  const body = await res.text();
  console.log('📨 CRON response:', body);
  if (!res.ok) {
    throw new Error(`Cron request failed with status ${res.status}`);
  }
}

// Main function
async function main() {
  console.log('🔍 Checking RAG System Status');
  console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`📁 Target folder: ${CONFIG.TARGET_FOLDER}`);
  console.log('');

  try {
    // Run cron job first to ensure at least one document is processed
    await runCron();

    // Verify that at least one document has chunks and corresponding records
    console.log('📄 Verifying processed documents...');
    const { data: docData, error: docError } = await supabase
      .from('documents_metadata')
      .select('id, chunk_count')
      .gt('chunk_count', 0)
      .limit(1);
    if (docError) {
      throw new Error(`Failed to fetch documents: ${docError.message}`);
    }
    if (!docData || docData.length === 0) {
      throw new Error('No documents with chunk_count > 0 found');
    }
    const docId = docData[0].id;
    const { count: chunkCount, error: chunkErr } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('doc_id', docId);
    if (chunkErr) {
      throw new Error(`Failed to verify chunks: ${chunkErr.message}`);
    }
    if (!chunkCount || chunkCount === 0) {
      throw new Error('No chunks found for processed document');
    }
    console.log(`✅ Document ${docId} has ${chunkCount} chunks`);

    // Check document processing status
    console.log('📊 Document Processing Status:');
    
    // Get total documents
    const { data: totalData, error: totalError } = await supabase
      .from('documents_metadata')
      .select('count')
      .ilike('storage_path', `${CONFIG.TARGET_FOLDER}%`);

    if (totalError) {
      throw new Error(`Failed to fetch total documents: ${totalError.message}`);
    }

    const totalDocuments = totalData[0].count;
    
    // Get processed documents
    const { data: processedData, error: processedError } = await supabase
      .from('documents_metadata')
      .select('count')
      .ilike('storage_path', `${CONFIG.TARGET_FOLDER}%`)
      .eq('processed', true);

    if (processedError) {
      throw new Error(`Failed to fetch processed documents: ${processedError.message}`);
    }

    const processedDocuments = processedData[0].count;
    
    // Get ready for indexing documents
    const { data: readyData, error: readyError } = await supabase
      .from('documents_metadata')
      .select('count')
      .ilike('storage_path', `${CONFIG.TARGET_FOLDER}%`)
      .eq('ready_for_indexing', true)
      .eq('processed', false);

    if (readyError) {
      throw new Error(`Failed to fetch ready documents: ${readyError.message}`);
    }

    const readyDocuments = readyData[0].count;
    
    // Get not ready documents
    const { data: notReadyData, error: notReadyError } = await supabase
      .from('documents_metadata')
      .select('count')
      .ilike('storage_path', `${CONFIG.TARGET_FOLDER}%`)
      .eq('ready_for_indexing', false);

    if (notReadyError) {
      throw new Error(`Failed to fetch not ready documents: ${notReadyError.message}`);
    }

    const notReadyDocuments = notReadyData[0].count;
    
    console.log(`   Total documents: ${totalDocuments}`);
    console.log(`   Processed: ${processedDocuments} (${((processedDocuments / totalDocuments) * 100).toFixed(2)}%)`);
    console.log(`   Ready for indexing: ${readyDocuments} (${((readyDocuments / totalDocuments) * 100).toFixed(2)}%)`);
    console.log(`   Not ready for indexing: ${notReadyDocuments} (${((notReadyDocuments / totalDocuments) * 100).toFixed(2)}%)`);
    
    // Check vector embeddings
    console.log('\n📊 Vector Embeddings Status:');
    
    // Get total chunks
    const { data: chunksData, error: chunksError } = await supabase
      .from('document_chunks')
      .select('count');

    if (chunksError) {
      throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
    }

    const totalChunks = chunksData[0].count;
    
    // Get chunks with embeddings
    const { data: embeddingsData, error: embeddingsError } = await supabase.rpc('sql', {
      query: "SELECT COUNT(*) FROM document_chunks WHERE embedding IS NOT NULL"
    });

    if (embeddingsError) {
      throw new Error(`Failed to fetch embeddings: ${embeddingsError.message}`);
    }

    const chunksWithEmbeddings = embeddingsData[0].count || 0;
    
    console.log(`   Total chunks: ${totalChunks}`);
    console.log(`   Chunks with embeddings: ${chunksWithEmbeddings} (${totalChunks > 0 ? ((chunksWithEmbeddings / totalChunks) * 100).toFixed(2) : 0}%)`);
    
    // Check vector extension
    console.log('\n🔧 Vector Extension Status:');
    
    const { data: extensionData, error: extensionError } = await supabase.rpc('sql', {
      query: "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
    });

    if (extensionError) {
      throw new Error(`Failed to check vector extension: ${extensionError.message}`);
    }

    const vectorExtension = extensionData.length > 0 ? extensionData[0] : null;
    
    if (vectorExtension) {
      console.log(`   ✅ Vector extension is installed (version: ${vectorExtension.extversion})`);
    } else {
      console.log('   ❌ Vector extension is not installed');
    }
    
    // Check vector search function
    console.log('\n🔍 Vector Search Function Status:');
    
    const { data: functionData, error: functionError } = await supabase.rpc('sql', {
      query: "SELECT proname, proargtypes FROM pg_proc WHERE proname = 'match_documents';"
    });

    if (functionError) {
      throw new Error(`Failed to check vector search function: ${functionError.message}`);
    }

    const searchFunction = functionData.length > 0 ? functionData[0] : null;
    
    if (searchFunction) {
      console.log('   ✅ Vector search function is installed');
    } else {
      console.log('   ❌ Vector search function is not installed');
    }
    
    // Provide recommendations
    console.log('\n🚀 Recommendations:');
    
    if (notReadyDocuments > 0) {
      console.log('   1. Mark documents as ready for indexing:');
      console.log('      node scripts/mark-documents-for-indexing.js');
    }
    
    if (readyDocuments > 0) {
      console.log('   2. Process documents that are ready for indexing:');
      console.log('      node scripts/ingest-handleidingen.js');
    }
    
    if (!vectorExtension) {
      console.log('   3. Install vector extension:');
      console.log('      CREATE EXTENSION IF NOT EXISTS vector;');
    }
    
    if (!searchFunction) {
      console.log('   4. Create vector search function:');
      console.log('      See supabase/migrations/20250628154139_withered_mode.sql');
    }
    
    if (processedDocuments === totalDocuments && totalDocuments > 0) {
      console.log('   ✅ All documents are processed! The RAG system is ready to use.');
    }

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Start the script
main().catch(console.error);