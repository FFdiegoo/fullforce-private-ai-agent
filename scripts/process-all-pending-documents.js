#!/usr/bin/env node

/**
 * Process All Pending Documents
 * 
 * This script finds all documents that are ready for indexing but not yet processed,
 * and triggers the RAG processing pipeline for each one.
 */

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  BATCH_SIZE: 10,
  DELAY_MS: 2000, // Delay between batches to avoid rate limits
};

// Validate configuration
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials. Please check your .env.local file.');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Statistics tracking
const stats = {
  totalDocuments: 0,
  processedDocuments: 0,
  failedDocuments: 0,
  startTime: Date.now(),
  errors: []
};

// Main function
async function main() {
  console.log('🚀 Starting Batch Processing of Pending Documents');
  console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`🌐 Site URL: ${CONFIG.SITE_URL}`);
  console.log('');

  try {
    // Find all documents that are ready for indexing but not processed
    console.log('🔍 Finding pending documents...');
    const { data: documents, error: docsError } = await supabase
      .from('documents_metadata')
      .select('id, filename, storage_path')
      .eq('ready_for_indexing', true)
      .eq('processed', false)
      .order('last_updated', { ascending: true });

    if (docsError) {
      throw new Error(`Failed to fetch documents: ${docsError.message}`);
    }

    if (!documents || documents.length === 0) {
      console.log('✅ No pending documents found. All documents are processed.');
      return;
    }

    stats.totalDocuments = documents.length;
    console.log(`📊 Found ${documents.length} pending documents`);
    
    // Process documents in batches
    const batches = chunkArray(documents, CONFIG.BATCH_SIZE);
    console.log(`📦 Created ${batches.length} batches for processing`);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`\n🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} documents)`);
      
      // Process each document in the batch
      const batchPromises = batch.map(document => processDocument(document));
      await Promise.all(batchPromises);
      
      // Show progress
      const progress = ((stats.processedDocuments + stats.failedDocuments) / stats.totalDocuments * 100).toFixed(2);
      const elapsedSeconds = Math.floor((Date.now() - stats.startTime) / 1000);
      const processRate = elapsedSeconds > 0 ? stats.processedDocuments / elapsedSeconds : 0;
      
      console.log(`Progress: ${progress}% | Speed: ${processRate.toFixed(2)} docs/sec | Processed: ${stats.processedDocuments} | Failed: ${stats.failedDocuments}`);
      
      // Delay between batches to avoid rate limits
      if (i < batches.length - 1) {
        console.log(`⏱️ Waiting ${CONFIG.DELAY_MS}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_MS));
      }
    }

    // Generate final report
    generateReport();

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Process a single document
async function processDocument(document) {
  try {
    console.log(`🔄 Processing: ${document.filename} (ID: ${document.id})`);
    
    // Call the process-document API
    const response = await fetch(`${CONFIG.SITE_URL}/api/process-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: document.id })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `API returned status ${response.status}`);
    }
    
    stats.processedDocuments++;
    console.log(`✅ Successfully processed: ${document.filename}`);
    return true;
    
  } catch (error) {
    stats.failedDocuments++;
    stats.errors.push({
      document: document.filename,
      id: document.id,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    console.error(`❌ Failed to process ${document.filename}: ${error.message}`);
    return false;
  }
}

// Helper function to split array into chunks
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Helper function to format time in HH:MM:SS
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':');
}

// Generate a detailed report
function generateReport() {
  const endTime = Date.now();
  const elapsedSeconds = Math.floor((endTime - stats.startTime) / 1000);
  const elapsedFormatted = formatTime(elapsedSeconds);
  
  console.log('\n📋 Document Processing Report');
  console.log('==========================');
  console.log(`⏱️ Duration: ${elapsedFormatted}`);
  console.log('');
  console.log('📊 Overall Statistics:');
  console.log(`   Total documents: ${stats.totalDocuments}`);
  console.log(`   Successfully processed: ${stats.processedDocuments}`);
  console.log(`   Failed: ${stats.failedDocuments}`);
  
  if (stats.totalDocuments > 0) {
    const successRate = ((stats.processedDocuments / stats.totalDocuments) * 100).toFixed(2);
    console.log(`   Success rate: ${successRate}%`);
  }
  
  if (stats.processedDocuments > 0 && elapsedSeconds > 0) {
    const processRate = stats.processedDocuments / elapsedSeconds;
    console.log(`   Processing rate: ${processRate.toFixed(2)} documents/second`);
  }
  
  if (stats.errors.length > 0) {
    console.log('\n❌ Errors:');
    stats.errors.slice(0, 10).forEach((error, index) => {
      console.log(`   ${index + 1}. ${error.document} (ID: ${error.id}): ${error.error}`);
    });
    
    if (stats.errors.length > 10) {
      console.log(`   ... and ${stats.errors.length - 10} more errors`);
    }
  }
  
  console.log('\n🚀 Next Steps:');
  console.log('   - Check the admin dashboard to verify document processing');
  console.log('   - Test the RAG system with queries in the chat interface');
  console.log('   - Run the monitor-rag-status.js script to see real-time processing status');
  
  console.log('\n✅ Processing completed!');
}

// Start the script
main().catch(console.error);