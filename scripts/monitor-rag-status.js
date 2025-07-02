#!/usr/bin/env node

/**
 * Monitor RAG Processing Status
 * 
 * This script monitors the status of RAG processing for uploaded documents.
 * It shows real-time statistics and progress.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  REFRESH_INTERVAL: 5000, // 5 seconds
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
  console.log('📊 RAG Processing Monitor');
  console.log('=======================');
  console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`🔄 Refresh interval: ${CONFIG.REFRESH_INTERVAL / 1000} seconds`);
  console.log('');
  
  let isRunning = true;
  
  // Handle Ctrl+C to exit gracefully
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping monitor...');
    isRunning = false;
  });
  
  while (isRunning) {
    try {
      // Get document processing stats
      const { data: totalDocs, error: totalError } = await supabase
        .from('documents_metadata')
        .select('count')
        .single();
        
      const { data: processedDocs, error: processedError } = await supabase
        .from('documents_metadata')
        .select('count')
        .eq('processed', true)
        .single();
        
      const { data: pendingDocs, error: pendingError } = await supabase
        .from('documents_metadata')
        .select('count')
        .eq('processed', false)
        .eq('ready_for_indexing', true)
        .single();
        
      const { data: chunks, error: chunksError } = await supabase
        .from('document_chunks')
        .select('count')
        .single();
      
      if (totalError || processedError || pendingError || chunksError) {
        console.error('❌ Error fetching stats:', totalError || processedError || pendingError || chunksError);
        await new Promise(resolve => setTimeout(resolve, CONFIG.REFRESH_INTERVAL));
        continue;
      }
      
      // Clear console and show stats
      console.clear();
      console.log('📊 RAG Processing Monitor');
      console.log('=======================');
      
      const totalCount = totalDocs?.count || 0;
      const processedCount = processedDocs?.count || 0;
      const pendingCount = pendingDocs?.count || 0;
      const chunksCount = chunks?.count || 0;
      
      const processedPercent = totalCount > 0 ? (processedCount / totalCount * 100).toFixed(2) : 0;
      const pendingPercent = totalCount > 0 ? (pendingCount / totalCount * 100).toFixed(2) : 0;
      
      console.log(`📄 Total Documents: ${totalCount}`);
      console.log(`✅ Processed: ${processedCount} (${processedPercent}%)`);
      console.log(`⏳ Pending: ${pendingCount} (${pendingPercent}%)`);
      console.log(`🧩 Total Chunks: ${chunksCount}`);
      console.log(`🧠 Avg. Chunks per Document: ${processedCount > 0 ? (chunksCount / processedCount).toFixed(2) : 0}`);
      
      // Progress bar
      const progressBar = createProgressBar(processedCount, totalCount);
      console.log(`\nProcessing Progress: ${processedPercent}%`);
      console.log(progressBar);
      
      // Get recent documents
      const { data: recentDocs, error: recentError } = await supabase
        .from('documents_metadata')
        .select('*')
        .order('last_updated', { ascending: false })
        .limit(5);
        
      if (!recentError && recentDocs) {
        console.log('\n📋 Recently Updated Documents:');
        recentDocs.forEach(doc => {
          const status = doc.processed ? '✅' : (doc.ready_for_indexing ? '⏳' : '⏸️');
          console.log(`   ${status} ${doc.filename} (${formatFileSize(doc.file_size || 0)})`);
        });
      }
      
      // Get processing rate
      const { data: processingRate, error: rateError } = await supabase
        .from('documents_metadata')
        .select('processed_at')
        .eq('processed', true)
        .order('processed_at', { ascending: false })
        .limit(10);
        
      if (!rateError && processingRate && processingRate.length >= 2) {
        const newest = new Date(processingRate[0].processed_at);
        const oldest = new Date(processingRate[processingRate.length - 1].processed_at);
        const timeSpan = (newest.getTime() - oldest.getTime()) / 1000; // in seconds
        
        if (timeSpan > 0) {
          const rate = processingRate.length / timeSpan;
          const estimatedTimeRemaining = pendingCount / rate;
          
          console.log(`\n⏱️ Processing Rate: ${rate.toFixed(2)} documents/second`);
          
          if (pendingCount > 0 && !isNaN(estimatedTimeRemaining)) {
            console.log(`⏳ Estimated time remaining: ${formatTime(estimatedTimeRemaining)}`);
          }
        }
      }
      
      console.log('\n🔄 Press Ctrl+C to exit');
      
      // Wait for next refresh
      await new Promise(resolve => setTimeout(resolve, CONFIG.REFRESH_INTERVAL));
      
    } catch (error) {
      console.error(`❌ Monitor error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.REFRESH_INTERVAL));
    }
  }
  
  console.log('👋 Monitor stopped');
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to format time in HH:MM:SS
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':');
}

// Helper function to create a progress bar
function createProgressBar(current, total, length = 30) {
  const percent = total > 0 ? Math.min(100, Math.floor((current / total) * 100)) : 0;
  const filledLength = Math.floor(length * percent / 100);
  const filled = '█'.repeat(filledLength);
  const empty = '░'.repeat(length - filledLength);
  return `[${filled}${empty}] ${percent}%`;
}

// Start the monitor
main().catch(console.error);