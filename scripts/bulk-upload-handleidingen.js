#!/usr/bin/env node

/**
 * Bulk Upload Script for Handleidingen Directory
 * 
 * This script uploads documents from the Handleidingen directory and all its subdirectories
 * to Supabase Storage, preserving the complete folder structure.
 * 
 * Features:
 * - Preserves complete folder structure
 * - Accepts all file types (including images and larger files)
 * - Handles nested subdirectories
 * - Provides detailed logging and error handling
 * - Generates a comprehensive report
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

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

// Validate configuration
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials. Please check your .env.local file.');
  process.exit(1);
}

if (!CONFIG.SOURCE_DIR) {
  console.error('❌ Please provide a source directory as an argument:');
  console.error('   node scripts/bulk-upload-handleidingen.js "D:\\120 handleidingen"');
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
  console.log('🚀 Starting Bulk Upload for Handleidingen');
  console.log(`📂 Source directory: ${CONFIG.SOURCE_DIR}`);
  console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`🪣 Storage bucket: ${CONFIG.STORAGE_BUCKET}`);
  console.log(`📋 File types: All file types accepted`);
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

    // Scan for category directories
    console.log('🔍 Scanning for category directories...');
    const categoryDirs = getCategoryDirectories(CONFIG.SOURCE_DIR);
    
    if (categoryDirs.length === 0) {
      throw new Error(`No category directories found in ${CONFIG.SOURCE_DIR}`);
    }
    
    console.log(`✅ Found ${categoryDirs.length} category directories:`);
    categoryDirs.forEach(dir => {
      console.log(`   - ${path.basename(dir)}`);
    });

    // Process each category directory
    for (const categoryDir of categoryDirs) {
      const categoryName = path.basename(categoryDir);
      console.log(`\n🔄 Processing category: ${categoryName}`);
      
      // Get all files in this category (including subdirectories)
      const files = getFilesToUpload(categoryDir);
      
      if (files.length === 0) {
        console.log(`   ⚠️ No files found in ${categoryName}`);
        continue;
      }
      
      console.log(`   🔍 Found ${files.length} files in ${categoryName}`);
      
      // Track category stats
      stats.categories[categoryName] = {
        total: files.length,
        uploaded: 0,
        skipped: 0,
        failed: 0,
        bytes: files.reduce((total, file) => total + file.size, 0)
      };
      
      stats.totalFiles += files.length;
      stats.totalBytes += stats.categories[categoryName].bytes;
      
      // Process files in batches
      const batches = chunkArray(files, CONFIG.BATCH_SIZE);
      console.log(`   📦 Created ${batches.length} batches for ${categoryName}`);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`   🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} files)`);
        
        for (const file of batch) {
          await processFile(file, categoryName);
          
          // Show progress
          const progress = ((stats.uploadedFiles + stats.skippedFiles + stats.failedFiles) / stats.totalFiles * 100).toFixed(2);
          const elapsedSeconds = Math.floor((Date.now() - stats.startTime) / 1000);
          const uploadRate = elapsedSeconds > 0 ? stats.uploadedFiles / elapsedSeconds : 0;
          
          console.log(`   Progress: ${progress}% | Speed: ${uploadRate.toFixed(2)} files/sec | Uploaded: ${stats.uploadedFiles} | Failed: ${stats.failedFiles} | Skipped: ${stats.skippedFiles}`);
        }
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
async function processFile(file, categoryName) {
  const relativePath = path.relative(path.join(CONFIG.SOURCE_DIR, categoryName), file.path);
  
  try {
    console.log(`   🔄 Processing: ${categoryName}\\${relativePath} (${formatFileSize(file.size)})`);

    // Determine storage path - preserve complete folder structure
    const storagePath = `${categoryName}/${relativePath.replace(/\\/g, '/')}`;
    
    // Create read stream for file
    let fileStream = fs.createReadStream(file.path);
    
    // Upload to Supabase Storage with retry logic
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
          console.log(`   ⚠️ Upload attempt ${uploadAttempt} failed for ${file.name}, retrying...`);
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
    const subDir = path.dirname(relativePath) !== '.' ? path.dirname(relativePath).split(path.sep)[0] : '';
    
    // Save metadata to database
    const { data: metadataData, error: metadataError } = await supabase
      .from('documents_metadata')
      .insert({
        filename: file.name,
        safe_filename: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.mimeType,
        afdeling: categoryName,
        categorie: subDir || categoryName,
        onderwerp: path.basename(file.name, path.extname(file.name)),
        versie: extractVersion(file.name),
        uploaded_by: 'bulk-upload-handleidingen',
        last_updated: new Date().toISOString(),
        ready_for_indexing: true,
        processed: false
      })
      .select();
    
    if (metadataError) {
      throw metadataError;
    }
    
    stats.uploadedFiles++;
    stats.uploadedBytes += file.size;
    stats.categories[categoryName].uploaded++;
    console.log(`   ✅ Uploaded: ${file.name} (${formatFileSize(file.size)})`);
    
  } catch (error) {
    stats.failedFiles++;
    stats.categories[categoryName].failed++;
    stats.errors.push({
      file: `${categoryName}\\${relativePath}`,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    console.error(`   ❌ Failed to upload ${file.name}: ${error.message}`);
  }
}

// Helper function to get category directories
function getCategoryDirectories(baseDir) {
  try {
    return fs.readdirSync(baseDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => path.join(baseDir, dirent.name));
  } catch (error) {
    console.error(`Error reading directories: ${error.message}`);
    return [];
  }
}

// Helper function to get all files to upload
function getFilesToUpload(dir) {
  const files = [];
  
  function traverseDir(currentPath) {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          traverseDir(fullPath);
        } else {
          try {
            const stats = fs.statSync(fullPath);
            const mimeType = mime.lookup(fullPath) || 'application/octet-stream';
            
            files.push({
              path: fullPath,
              name: entry.name,
              size: stats.size,
              extension: path.extname(entry.name).toLowerCase(),
              mimeType: mimeType
            });
          } catch (error) {
            console.warn(`   ⚠️ Could not read file ${fullPath}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.warn(`   ⚠️ Could not read directory ${currentPath}: ${error.message}`);
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
  
  const reportPath = path.join(process.cwd(), 'handleidingen-upload-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  
  // Provide next steps
  console.log('\n🚀 Next Steps:');
  console.log('   - Process uploaded files through the RAG pipeline');
  console.log('   - Verify document metadata in the admin dashboard');
  console.log('   - Run verification script to ensure all files were uploaded correctly');
  
  console.log('\n✅ Upload completed!');
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

// Start the script
main().catch(console.error);