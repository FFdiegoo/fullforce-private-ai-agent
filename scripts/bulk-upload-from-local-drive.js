#!/usr/bin/env node

/**
 * Bulk Upload From Local Drive
 * 
 * This script scans a local drive (e.g., D:\) for files,
 * uploads them to Supabase Storage, and processes them for RAG.
 * 
 * Usage: node scripts/bulk-upload-from-local-drive.js <source-directory>
 * Example: node scripts/bulk-upload-from-local-drive.js D:\
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  STORAGE_BUCKET: 'company-docs',
  SOURCE_DIR: process.argv[2] || '', // First argument is the source directory
  MAX_FILE_SIZE: 1024 * 1024 * 1024, // 1GB - accept all file sizes
  BATCH_SIZE: 20,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000, // ms
};

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.doc', '.odt', '.csv', '.rtf'];

// Validate configuration
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials. Please check your .env.local file.');
  process.exit(1);
}

if (!CONFIG.SOURCE_DIR) {
  console.error('❌ Please provide a source directory as an argument:');
  console.error('   node scripts/bulk-upload-from-local-drive.js D:\\');
  process.exit(1);
}

if (!fs.existsSync(CONFIG.SOURCE_DIR)) {
  console.error(`❌ Source directory does not exist: ${CONFIG.SOURCE_DIR}`);
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Statistics tracking
const stats = {
  totalFiles: 0,
  uploadedFiles: 0,
  skippedFiles: 0,
  failedFiles: 0,
  totalBytes: 0,
  uploadedBytes: 0,
  startTime: Date.now(),
  errors: [],
  categories: {}
};

// Main function
async function main() {
  console.log('🚀 Starting Bulk Upload from Local Drive');
  console.log(`📂 Source directory: ${CONFIG.SOURCE_DIR}`);
  console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`🪣 Storage bucket: ${CONFIG.STORAGE_BUCKET}`);
  console.log(`📋 Supported file types: ${SUPPORTED_EXTENSIONS.join(', ')}`);
  console.log(`📏 Max file size: ${formatFileSize(CONFIG.MAX_FILE_SIZE)}`);
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

    // Verify storage bucket exists
    console.log(`🔍 Verifying storage bucket: ${CONFIG.STORAGE_BUCKET}`);
    const { data: buckets, error: bucketsError } = await supabase
      .storage
      .listBuckets();

    if (bucketsError) {
      throw new Error(`Failed to list storage buckets: ${bucketsError.message}`);
    }

    const bucketExists = buckets.some(bucket => bucket.name === CONFIG.STORAGE_BUCKET);
    if (!bucketExists) {
      console.log(`⚠️ Bucket '${CONFIG.STORAGE_BUCKET}' not found, attempting to create it...`);
      const { error: createError } = await supabase.storage.createBucket(CONFIG.STORAGE_BUCKET, {
        public: false
      });

      if (createError) {
        throw new Error(`Failed to create bucket: ${createError.message}`);
      }
      console.log(`✅ Bucket '${CONFIG.STORAGE_BUCKET}' created successfully`);
    } else {
      console.log(`✅ Bucket '${CONFIG.STORAGE_BUCKET}' exists`);
    }

    // Get all files to upload
    console.log('🔍 Scanning for files...');
    const files = getFilesToUpload(CONFIG.SOURCE_DIR);
    
    if (files.length === 0) {
      console.log('❌ No files found to upload');
      return;
    }
    
    stats.totalFiles = files.length;
    stats.totalBytes = files.reduce((total, file) => total + file.size, 0);
    
    console.log(`📊 Found ${files.length} files (${formatFileSize(stats.totalBytes)})`);
    
    // Process files in batches
    const batches = chunkArray(files, CONFIG.BATCH_SIZE);
    console.log(`📦 Created ${batches.length} batches for processing`);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} files)`);
      
      for (const file of batch) {
        await processFile(file);
        
        // Show progress
        const progress = ((stats.uploadedFiles + stats.skippedFiles + stats.failedFiles) / stats.totalFiles * 100).toFixed(2);
        const elapsedSeconds = Math.floor((Date.now() - stats.startTime) / 1000);
        const uploadRate = elapsedSeconds > 0 ? stats.uploadedFiles / elapsedSeconds : 0;
        
        console.log(`Progress: ${progress}% | Speed: ${uploadRate.toFixed(2)} files/sec | Uploaded: ${stats.uploadedFiles} | Failed: ${stats.failedFiles} | Skipped: ${stats.skippedFiles}`);
      }
    }

    // Generate final report
    generateReport();

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Process a single file
async function processFile(file) {
  try {
    console.log(`🔄 Processing: ${file.relativePath} (${formatFileSize(file.size)})`);

    // Extract category from path
    const pathParts = file.relativePath.split(path.sep);
    let category = pathParts[0] || 'General';
    
    // Track category stats
    if (!stats.categories[category]) {
      stats.categories[category] = {
        total: 1,
        uploaded: 0,
        skipped: 0,
        failed: 0,
        bytes: file.size
      };
    } else {
      stats.categories[category].total++;
      stats.categories[category].bytes += file.size;
    }
    
    // Create read stream for file
    let fileStream = fs.createReadStream(file.path);
    
    // Upload to Supabase Storage with retry logic
    const timestamp = Date.now();
    const uniqueId = uuidv4().substring(0, 8);
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const safeFileName = `${timestamp}_${uniqueId}_${sanitizedName}`;
    const storageDir = path.dirname(file.relativePath).replace(/\\/g, '/');
    const storagePath = storageDir && storageDir !== '.' ? `${storageDir}/${safeFileName}` : safeFileName;

    let uploadAttempt = 0;
    let uploadSuccess = false;
    let uploadError = null;

    while (uploadAttempt < CONFIG.RETRY_ATTEMPTS && !uploadSuccess) {
      uploadAttempt++;

      try {
        // Upload to Supabase Storage
        const { data: storageData, error: storageError } = await supabase.storage
          .from(CONFIG.STORAGE_BUCKET)
          .upload(storagePath, fileStream, {
            contentType: file.mimeType,
            upsert: true, // Use upsert to overwrite if file exists
            duplex: 'half' // Optimize for large files
          });

        if (storageError) {
          throw storageError;
        }

        uploadSuccess = true;

      } catch (error) {
        uploadError = error;

        // If not the last attempt, wait before retrying
        if (uploadAttempt < CONFIG.RETRY_ATTEMPTS) {
          console.log(`⚠️ Upload attempt ${uploadAttempt} failed for ${file.name}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));

          // Create a new file stream for the retry
          fileStream.destroy();
          fileStream = fs.createReadStream(file.path);
        }
      }
    }
    
    if (!uploadSuccess) {
      throw uploadError || new Error('Upload failed after multiple attempts');
    }
    
    // Extract subdirectory for better categorization
    const subDir = pathParts.length > 1 ? pathParts[1] : '';
    
    // Save metadata to database
    const { data: metadataData, error: metadataError } = await supabase
      .from('documents_metadata')
      .insert({
        filename: file.name,
        safe_filename: safeFileName,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.mimeType,
        afdeling: category,
        categorie: subDir || category,
        onderwerp: path.basename(file.name, path.extname(file.name)),
        versie: extractVersion(file.name),
        uploaded_by: 'bulk-upload-script',
        last_updated: new Date().toISOString(),
        ready_for_indexing: true,
        processed: false
      })
      .select();
    
    if (metadataError) {
      throw metadataError;
    }
    
    // Trigger RAG processing
    const documentId = metadataData[0].id;
    
    const { error: processError } = await supabase.functions.invoke('process-document', {
      body: { documentId }
    }).catch(() => {
      // Fallback to REST API if Edge Function fails
      return fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/process-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: documentId })
      });
    });
    
    if (processError) {
      console.warn(`⚠️ RAG processing request failed: ${processError.message}`);
      console.log(`   Document uploaded but will need manual processing`);
    }
    
    stats.uploadedFiles++;
    stats.uploadedBytes += file.size;
    stats.categories[category].uploaded++;
    console.log(`✅ Uploaded: ${file.name} (${formatFileSize(file.size)})`);
    
  } catch (error) {
    stats.failedFiles++;
    
    // Track category stats for failures
    const pathParts = file.relativePath.split(path.sep);
    let category = pathParts[0] || 'General';
    
    if (stats.categories[category]) {
      stats.categories[category].failed++;
    }
    
    stats.errors.push({
      file: file.relativePath,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    console.error(`❌ Failed to upload ${file.name}: ${error.message}`);
  }
}

// Helper function to get all files to upload
function getFilesToUpload(dir) {
  const files = [];
  
  function traverseDir(currentPath, relativePath = '') {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;
        
        if (entry.isDirectory()) {
          traverseDir(fullPath, entryRelativePath);
        } else {
          try {
            const ext = path.extname(entry.name).toLowerCase();
            if (!SUPPORTED_EXTENSIONS.includes(ext)) {
              console.warn(`⚠️ Skipping unsupported file type: ${fullPath}`);
              continue;
            }
            const stats = fs.statSync(fullPath);
            const mimeType = mime.lookup(fullPath) || 'application/octet-stream';

            files.push({
              path: fullPath,
              relativePath: entryRelativePath,
              name: entry.name,
              size: stats.size,
              extension: ext,
              mimeType: mimeType
            });
          } catch (error) {
            console.warn(`⚠️ Could not read file ${fullPath}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Could not read directory ${currentPath}: ${error.message}`);
    }
  }
  
  traverseDir(dir);
  return files;
}

// Helper function to extract version from filename
function extractVersion(filename) {
  // Try to extract version from filename (e.g., "document_v1.0.pdf" or "document-1.0.pdf")
  const versionMatch = filename.match(/[_-]v?(\d+\.\d+)/i);
  return versionMatch ? versionMatch[1] : '1.0';
}

// Helper function to split array into chunks
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
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
  
  console.log('\n📋 Bulk Upload Report');
  console.log('===================');
  console.log(`📂 Source: ${CONFIG.SOURCE_DIR}`);
  console.log(`⏱️ Duration: ${elapsedFormatted}`);
  console.log('');
  console.log('📊 Overall Statistics:');
  console.log(`   Total files found: ${stats.totalFiles}`);
  console.log(`   Total size: ${formatFileSize(stats.totalBytes)}`);
  console.log(`   Files uploaded: ${stats.uploadedFiles}`);
  console.log(`   Upload size: ${formatFileSize(stats.uploadedBytes)}`);
  console.log(`   Files skipped: ${stats.skippedFiles}`);
  console.log(`   Files failed: ${stats.failedFiles}`);
  
  if (stats.totalFiles > 0) {
    const successRate = ((stats.uploadedFiles / stats.totalFiles) * 100).toFixed(2);
    console.log(`   Success rate: ${successRate}%`);
  }
  
  if (stats.uploadedFiles > 0 && elapsedSeconds > 0) {
    const uploadRate = stats.uploadedFiles / elapsedSeconds;
    const uploadSpeedMBps = (stats.uploadedBytes / 1024 / 1024) / elapsedSeconds;
    console.log(`   Upload rate: ${uploadRate.toFixed(2)} files/second`);
    console.log(`   Upload speed: ${uploadSpeedMBps.toFixed(2)} MB/second`);
  }
  
  console.log('\n📊 Category Statistics:');
  Object.entries(stats.categories).forEach(([category, catStats]) => {
    console.log(`   ${category}:`);
    console.log(`      Total: ${catStats.total} files (${formatFileSize(catStats.bytes)})`);
    console.log(`      Uploaded: ${catStats.uploaded} files`);
    console.log(`      Skipped: ${catStats.skipped} files`);
    console.log(`      Failed: ${catStats.failed} files`);
    
    if (catStats.total > 0) {
      const catSuccessRate = ((catStats.uploaded / catStats.total) * 100).toFixed(2);
      console.log(`      Success rate: ${catSuccessRate}%`);
    }
  });
  
  if (stats.errors.length > 0) {
    console.log('\n❌ Errors:');
    stats.errors.slice(0, 10).forEach((error, index) => {
      console.log(`   ${index + 1}. ${error.file}: ${error.error}`);
    });
    
    if (stats.errors.length > 10) {
      console.log(`   ... and ${stats.errors.length - 10} more errors`);
    }
  }
  
  // Save detailed report to file
  const report = {
    timestamp: new Date().toISOString(),
    configuration: {
      sourceDir: CONFIG.SOURCE_DIR,
      maxFileSize: CONFIG.MAX_FILE_SIZE
    },
    statistics: {
      totalFiles: stats.totalFiles,
      totalBytes: stats.totalBytes,
      uploadedFiles: stats.uploadedFiles,
      uploadedBytes: stats.uploadedBytes,
      skippedFiles: stats.skippedFiles,
      failedFiles: stats.failedFiles,
      duration: elapsedSeconds,
      successRate: stats.totalFiles > 0 ? (stats.uploadedFiles / stats.totalFiles) * 100 : 0
    },
    categories: stats.categories,
    errors: stats.errors
  };
  
  const reportPath = path.join(process.cwd(), 'local-drive-upload-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  
  // Provide next steps
  console.log('\n🚀 Next Steps:');
  console.log('   - Check the admin dashboard to verify document processing');
  console.log('   - Test the RAG system with queries in the chat interface');
  console.log('   - Run the RAG test script to verify functionality');
  
  console.log('\n✅ Upload completed!');
}

// Start the script
main().catch(console.error);