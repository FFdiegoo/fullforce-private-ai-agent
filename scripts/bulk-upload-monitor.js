#!/usr/bin/env node

/**
 * Bulk Upload Monitor
 * 
 * This script monitors the progress of bulk uploads to Supabase
 * and provides real-time statistics and error reporting.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  REFRESH_INTERVAL: 5000, // 5 seconds
  SHOW_ERRORS: true,
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
  console.log('📊 Bulk Upload Monitor');
  console.log('=====================');
  console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`🔄 Refresh interval: ${CONFIG.REFRESH_INTERVAL / 1000} seconds`);
  console.log('');
  
  let isRunning = true;
  let lastProgress = null;
  
  // Handle Ctrl+C to exit gracefully
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping monitor...');
    isRunning = false;
  });
  
  while (isRunning) {
    try {
      // Get latest migration progress
      const { data: progressData, error: progressError } = await supabase
        .from('migration_progress')
        .select('*')
        .order('start_time', { ascending: false })
        .limit(1)
        .single();
      
      if (progressError) {
        if (progressError.code === 'PGRST116') {
          console.log('⚠️ No migration progress records found. Is a bulk upload running?');
        } else {
          console.error(`❌ Error fetching progress: ${progressError.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, CONFIG.REFRESH_INTERVAL));
        continue;
      }
      
      // Clear console and show progress
      console.clear();
      console.log('📊 Bulk Upload Monitor');
      console.log('=====================');
      
      const now = new Date();
      const startTime = new Date(progressData.start_time);
      const estimatedCompletion = progressData.estimated_completion ? new Date(progressData.estimated_completion) : null;
      const elapsedSeconds = Math.floor((now - startTime) / 1000);
      const elapsedFormatted = formatTime(elapsedSeconds);
      
      const totalFiles = progressData.total_files;
      const uploadedFiles = progressData.uploaded_files;
      const processedFiles = progressData.processed_files;
      const failedFiles = progressData.failed_files;
      const remainingFiles = totalFiles - uploadedFiles - failedFiles;
      
      const progressPercent = totalFiles > 0 
        ? ((uploadedFiles + failedFiles) / totalFiles * 100).toFixed(2)
        : 0;
      
      console.log(`Status: ${progressData.status.toUpperCase()}`);
      console.log(`Started: ${startTime.toLocaleString()} (${elapsedFormatted} ago)`);
      
      if (estimatedCompletion && progressData.status === 'running') {
        const remainingSeconds = Math.floor((estimatedCompletion - now) / 1000);
        if (remainingSeconds > 0) {
          console.log(`Estimated completion: ${estimatedCompletion.toLocaleString()} (${formatTime(remainingSeconds)} remaining)`);
        } else {
          console.log(`Estimated completion: Finalizing...`);
        }
      }
      
      console.log('');
      console.log(`Progress: ${progressPercent}% [${createProgressBar(progressPercent)}]`);
      console.log(`Total files: ${totalFiles}`);
      console.log(`Uploaded: ${uploadedFiles} (${((uploadedFiles / totalFiles) * 100).toFixed(2)}%)`);
      console.log(`Failed: ${failedFiles} (${((failedFiles / totalFiles) * 100).toFixed(2)}%)`);
      console.log(`Remaining: ${remainingFiles} (${((remainingFiles / totalFiles) * 100).toFixed(2)}%)`);
      
      if (processedFiles > 0) {
        console.log(`Processed by RAG: ${processedFiles} (${((processedFiles / totalFiles) * 100).toFixed(2)}%)`);
      }
      
      // Show upload rate
      if (lastProgress && progressData.status === 'running') {
        const timeDiff = (now - new Date(lastProgress.start_time)) / 1000; // in seconds
        const filesDiff = (uploadedFiles + failedFiles) - (lastProgress.uploaded_files + lastProgress.failed_files);
        
        if (timeDiff > 0 && filesDiff > 0) {
          const rate = filesDiff / timeDiff;
          console.log(`Upload rate: ${rate.toFixed(2)} files/second`);
        }
      }
      
      // Show recent errors if enabled
      if (CONFIG.SHOW_ERRORS && failedFiles > 0) {
        console.log('');
        console.log('Recent Errors:');
        
        const { data: errorLogs, error: logsError } = await supabase
          .from('audit_logs')
          .select('*')
          .ilike('action', '%UPLOAD_ERROR%')
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (logsError) {
          console.log(`  ⚠️ Could not fetch error logs: ${logsError.message}`);
        } else if (errorLogs && errorLogs.length > 0) {
          errorLogs.forEach(log => {
            const timestamp = new Date(log.created_at).toLocaleTimeString();
            const filename = log.metadata?.filename || 'Unknown file';
            const errorMessage = log.metadata?.error || 'Unknown error';
            console.log(`  ❌ [${timestamp}] ${filename}: ${errorMessage}`);
          });
        } else {
          console.log('  No detailed error logs available');
        }
      }
      
      // Update last progress
      lastProgress = progressData;
      
      // If migration is complete, exit after showing final status
      if (progressData.status === 'completed') {
        console.log('');
        console.log('✅ Bulk upload completed!');
        console.log(`Total files processed: ${uploadedFiles + failedFiles}`);
        console.log(`Success rate: ${((uploadedFiles / (uploadedFiles + failedFiles)) * 100).toFixed(2)}%`);
        console.log(`Total time: ${elapsedFormatted}`);
        
        // Wait for one more refresh cycle then exit
        await new Promise(resolve => setTimeout(resolve, CONFIG.REFRESH_INTERVAL));
        isRunning = false;
        break;
      }
      
      // Wait for next refresh
      await new Promise(resolve => setTimeout(resolve, CONFIG.REFRESH_INTERVAL));
      
    } catch (error) {
      console.error(`❌ Monitor error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.REFRESH_INTERVAL));
    }
  }
  
  console.log('👋 Monitor stopped');
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

// Helper function to create a progress bar
function createProgressBar(percent, length = 30) {
  const filled = Math.floor(length * (percent / 100));
  const empty = length - filled;
  
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// Start the monitor
main().catch(console.error);