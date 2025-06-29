#!/usr/bin/env node

/**
 * Bulk Upload Script for Handleidingen Directory
 * 
 * This script uploads documents from the "handleidingen" directory on a USB drive
 * to Supabase Storage and stores metadata in the documents_metadata table.
 * 
 * Features:
 * - Only processes the "handleidingen" directory
 * - Excludes the "MISC" directory
 * - Filters by file type (PDF, DOC, DOCX, TXT, MD)
 * - Enforces 10MB file size limit
 * - Extracts metadata from directory structure
 * - Generates safe filenames
 * - Provides detailed logging and error handling
 * - Generates a comprehensive report
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  STORAGE_BUCKET: 'company-docs',
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_EXTENSIONS: ['.pdf', '.doc', '.docx', '.txt', '.md'],
  BATCH_SIZE: 20,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000, // ms
  SOURCE_DIR: process.argv[2] || '', // First argument is the source directory
  TARGET_DIR: 'handleidingen',
  EXCLUDE_DIRS: ['MISC'],
  TEST_MODE: true, // Only process handleidingen directory
};

// Validate configuration
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials. Please check your .env.local file.');
  process.exit(1);
}

if (!CONFIG.SOURCE_DIR) {
  console.error('❌ Please provide a source directory as an argument:');
  console.error('   node scripts/bulk-upload-handleidingen.js /path/to/usb');
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
  errors: []
};

// Main function
async function main() {
  console.log('🚀 Starting Bulk Upload for Handleidingen');
  console.log(`📂 Source directory: ${CONFIG.SOURCE_DIR}`);
  console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`🪣 Storage bucket: ${CONFIG.STORAGE_BUCKET}`);
  console.log(`📋 File types: ${CONFIG.ALLOWED_EXTENSIONS.join(', ')}`);
  console.log(`📏 Max file size: ${formatFileSize(CONFIG.MAX_FILE_SIZE)}`);
  console.log(`🧪 Test mode: ${CONFIG.TEST_MODE ? 'Enabled (only handleidingen)' : 'Disabled'}`);
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
      throw new Error(`Storage bucket '${CONFIG.STORAGE_BUCKET}' does not exist`);
    }
    console.log(`✅ Bucket '${CONFIG.STORAGE_BUCKET}' exists`);

    // Find handleidingen directory
    console.log(`🔍 Looking for '${CONFIG.TARGET_DIR}' directory...`);
    const handleidingenPath = findDirectory(CONFIG.SOURCE_DIR, CONFIG.TARGET_DIR);
    
    if (!handleidingenPath) {
      throw new Error(`Could not find '${CONFIG.TARGET_DIR}' directory in ${CONFIG.SOURCE_DIR}`);
    }
    console.log(`✅ Found '${CONFIG.TARGET_DIR}' directory: ${handleidingenPath}`);

    // Get all files in handleidingen directory
    console.log('📂 Scanning for files...');
    const files = getFilesToUpload(handleidingenPath);
    stats.totalFiles = files.length;
    stats.totalBytes = files.reduce((total, file) => total + file.size, 0);
    
    console.log(`📊 Found ${files.length} files (${formatFileSize(stats.totalBytes)})`);

    // Process files in batches
    const batches = chunkArray(files, CONFIG.BATCH_SIZE);
    console.log(`📦 Created ${batches.length} batches`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`\n🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} files)`);
      
      for (const file of batch) {
        await processFile(file);
        
        // Show progress
        const progress = ((stats.uploadedFiles + stats.skippedFiles + stats.failedFiles) / stats.totalFiles * 100).toFixed(2);
        const elapsedSeconds = Math.floor((Date.now() - stats.startTime) / 1000);
        const uploadRate = stats.uploadedFiles / (elapsedSeconds || 1);
        
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
  const relativePath = path.relative(CONFIG.SOURCE_DIR, file.path);
  
  try {
    // Check if file should be skipped
    if (shouldSkipFile(file)) {
      stats.skippedFiles++;
      console.log(`⏩ Skipping: ${relativePath} (${file.reason})`);
      return;
    }

    console.log(`📄 Processing: ${relativePath} (${formatFileSize(file.size)})`);

    // Extract metadata from file path
    const metadata = extractMetadata(file.path);
    
    // Generate a safe filename with timestamp and UUID
    const timestamp = Date.now();
    const uniqueId = uuidv4().substring(0, 8);
    const safeFileName = `${timestamp}_${uniqueId}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    
    // Determine storage path (preserve directory structure within handleidingen)
    const handleidingenRelativePath = path.relative(
      findDirectory(CONFIG.SOURCE_DIR, CONFIG.TARGET_DIR),
      file.path
    );
    
    const storagePath = `handleidingen/${handleidingenRelativePath.replace(/\\/g, '/')}`;
    
    // Create read stream for file
    const fileStream = fs.createReadStream(file.path);
    
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
            upsert: false,
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
          const newFileStream = fs.createReadStream(file.path);
          fileStream = newFileStream;
        }
      }
    }
    
    if (!uploadSuccess) {
      throw uploadError || new Error('Upload failed after multiple attempts');
    }
    
    // Save metadata to database
    const { data: metadataData, error: metadataError } = await supabase
      .from('documents_metadata')
      .insert({
        filename: file.name,
        safe_filename: safeFileName,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.mimeType,
        afdeling: metadata.department,
        categorie: metadata.category,
        onderwerp: metadata.subject,
        versie: metadata.version,
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
    console.log(`✅ Uploaded: ${file.name} (${formatFileSize(file.size)})`);
    
  } catch (error) {
    stats.failedFiles++;
    stats.errors.push({
      file: relativePath,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    console.error(`❌ Failed to upload ${file.name}: ${error.message}`);
  }
}

// Helper function to find a directory recursively
function findDirectory(baseDir, targetDir) {
  // Check if the current directory is the target
  if (path.basename(baseDir).toLowerCase() === targetDir.toLowerCase()) {
    return baseDir;
  }
  
  // Check subdirectories
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(baseDir, entry.name);
        
        // Skip excluded directories
        if (CONFIG.EXCLUDE_DIRS.includes(entry.name)) {
          continue;
        }
        
        // Check if this directory is the target
        if (entry.name.toLowerCase() === targetDir.toLowerCase()) {
          return fullPath;
        }
        
        // Recursively check subdirectories
        const found = findDirectory(fullPath, targetDir);
        if (found) {
          return found;
        }
      }
    }
  } catch (error) {
    console.warn(`⚠️ Could not read directory ${baseDir}: ${error.message}`);
  }
  
  return null;
}

// Helper function to get all files to upload
function getFilesToUpload(dir) {
  const files = [];
  
  function traverseDir(currentPath) {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        // Skip excluded directories
        if (entry.isDirectory()) {
          if (CONFIG.EXCLUDE_DIRS.includes(entry.name)) {
            console.log(`⏩ Skipping excluded directory: ${entry.name}`);
            continue;
          }
          traverseDir(fullPath);
        } else {
          // Check file extension
          const ext = path.extname(entry.name).toLowerCase();
          const stats = fs.statSync(fullPath);
          const mimeType = mime.lookup(fullPath) || 'application/octet-stream';
          
          let skipReason = null;
          
          // Check if file should be included
          if (!CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
            skipReason = `Unsupported file type: ${ext}`;
          } else if (stats.size > CONFIG.MAX_FILE_SIZE) {
            skipReason = `File too large: ${formatFileSize(stats.size)} > ${formatFileSize(CONFIG.MAX_FILE_SIZE)}`;
          }
          
          files.push({
            path: fullPath,
            name: entry.name,
            size: stats.size,
            extension: ext,
            mimeType: mimeType,
            reason: skipReason
          });
        }
      }
    } catch (error) {
      console.warn(`⚠️ Could not read directory ${currentPath}: ${error.message}`);
    }
  }
  
  traverseDir(dir);
  return files;
}

// Helper function to check if a file should be skipped
function shouldSkipFile(file) {
  return !!file.reason;
}

// Helper function to extract metadata from file path
function extractMetadata(filePath) {
  const fileName = path.basename(filePath);
  const dirPath = path.dirname(filePath);
  const dirParts = dirPath.split(path.sep);
  
  // Find handleidingen in the path to use as reference point
  const handleidingenIndex = dirParts.findIndex(part => 
    part.toLowerCase() === CONFIG.TARGET_DIR.toLowerCase()
  );
  
  // Default metadata
  const metadata = {
    department: 'Technisch',
    category: 'Handleidingen',
    subject: fileName.replace(/\.[^/.]+$/, ''), // Remove extension
    version: '1.0'
  };
  
  if (handleidingenIndex !== -1 && handleidingenIndex < dirParts.length - 1) {
    // Extract category from the directory after handleidingen
    metadata.category = dirParts[handleidingenIndex + 1];
    
    // If there's another level, use it as subject
    if (handleidingenIndex + 2 < dirParts.length) {
      metadata.subject = dirParts[handleidingenIndex + 2];
    }
  }
  
  // Try to extract version from filename (e.g., "document_v1.0.pdf")
  const versionMatch = fileName.match(/_v(\d+\.\d+)/);
  if (versionMatch) {
    metadata.version = versionMatch[1];
    // Remove version from subject if it's from the filename
    if (metadata.subject === fileName.replace(/\.[^/.]+$/, '')) {
      metadata.subject = metadata.subject.replace(/_v\d+\.\d+$/, '');
    }
  }
  
  return metadata;
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
  console.log(`🎯 Target: ${CONFIG.TARGET_DIR} directory`);
  console.log(`⏱️ Duration: ${elapsedFormatted}`);
  console.log('');
  console.log('📊 Statistics:');
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
      targetDir: CONFIG.TARGET_DIR,
      allowedExtensions: CONFIG.ALLOWED_EXTENSIONS,
      maxFileSize: CONFIG.MAX_FILE_SIZE,
      testMode: CONFIG.TEST_MODE
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
    errors: stats.errors
  };
  
  const reportPath = path.join(process.cwd(), 'handleidingen-upload-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  
  // Provide next steps
  console.log('\n🚀 Next Steps:');
  
  if (stats.failedFiles > 0) {
    console.log('   - Review the errors and retry failed uploads');
  }
  
  if (stats.uploadedFiles > 0) {
    console.log('   - Process uploaded files through the RAG pipeline');
    console.log('   - Verify document metadata in the admin dashboard');
  }
  
  console.log('   - Run verification script to ensure all files were uploaded correctly');
  
  if (stats.uploadedFiles === 0) {
    console.log('\n⚠️ No files were uploaded. Please check the source directory and file filters.');
  } else {
    console.log('\n✅ Upload completed!');
  }
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