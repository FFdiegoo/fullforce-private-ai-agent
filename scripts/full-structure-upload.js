#!/usr/bin/env node

/**
 * Full Structure Upload Script for Supabase
 * 
 * This script mirrors the complete folder structure from a source directory
 * to Supabase Storage and uploads files from the Handleidingen directory.
 * 
 * Features:
 * - Creates the complete folder structure in Supabase Storage
 * - Uploads only files from the Handleidingen directory
 * - Preserves all subdirectories
 * - Handles large files and various file types
 * - Provides detailed logging and error handling
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
  HANDLEIDINGEN_DIR_PATTERN: /\b120\s*handleidingen\b/i, // Case-insensitive pattern for "120 Handleidingen"
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
  console.error('   node scripts/full-structure-upload.js D:\\');
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
  totalDirectories: 0,
  createdDirectories: 0,
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
  console.log('🚀 Starting Full Structure Upload to Supabase');
  console.log(`📂 Source directory: ${CONFIG.SOURCE_DIR}`);
  console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`🪣 Storage bucket: ${CONFIG.STORAGE_BUCKET}`);
  console.log(`🔍 Will upload files from directories matching: ${CONFIG.HANDLEIDINGEN_DIR_PATTERN}`);
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

    // Step 1: Scan the directory structure
    console.log('🔍 Scanning directory structure...');
    const { directories, handleidingenDirs, files } = scanDirectoryStructure(CONFIG.SOURCE_DIR);
    
    stats.totalDirectories = directories.length;
    console.log(`📊 Found ${directories.length} directories`);
    
    if (handleidingenDirs.length === 0) {
      console.warn(`⚠️ No directories matching "${CONFIG.HANDLEIDINGEN_DIR_PATTERN}" found!`);
      console.log('Will still create the directory structure, but no files will be uploaded.');
    } else {
      console.log(`✅ Found ${handleidingenDirs.length} Handleidingen directories:`);
      handleidingenDirs.forEach(dir => {
        console.log(`   - ${dir}`);
      });
      
      stats.totalFiles = files.length;
      stats.totalBytes = files.reduce((total, file) => total + file.size, 0);
      console.log(`📊 Found ${files.length} files to upload (${formatFileSize(stats.totalBytes)})`);
    }

    // Step 2: Create the directory structure
    console.log('\n🔍 Creating directory structure in Supabase...');
    await createDirectoryStructure(directories);
    console.log(`✅ Created ${stats.createdDirectories} directories in Supabase`);

    // Step 3: Upload files from Handleidingen directories
    if (files.length > 0) {
      console.log('\n🔍 Uploading files from Handleidingen directories...');
      
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
    }

    // Generate final report
    generateReport();

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Scan directory structure and find files to upload
function scanDirectoryStructure(baseDir) {
  const directories = [];
  const handleidingenDirs = [];
  const filesToUpload = [];
  
  function traverseDir(currentPath, relativePath = '') {
    try {
      // Add current directory to the list
      if (relativePath) {
        directories.push(relativePath);
      }
      
      // Check if this is a Handleidingen directory
      if (CONFIG.HANDLEIDINGEN_DIR_PATTERN.test(relativePath)) {
        handleidingenDirs.push(relativePath);
      }
      
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;
        
        if (entry.isDirectory()) {
          traverseDir(fullPath, entryRelativePath);
        } else if (isInHandleidingenDir(relativePath)) {
          // Only collect files from Handleidingen directories
          try {
            const stats = fs.statSync(fullPath);
            const mimeType = mime.lookup(fullPath) || 'application/octet-stream';
            
            filesToUpload.push({
              path: fullPath,
              relativePath: entryRelativePath,
              name: entry.name,
              size: stats.size,
              extension: path.extname(entry.name).toLowerCase(),
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
  
  // Check if a path is within a Handleidingen directory
  function isInHandleidingenDir(relativePath) {
    if (!relativePath) return false;
    
    // Check if this path or any parent path matches the Handleidingen pattern
    const pathParts = relativePath.split(path.sep);
    for (let i = 0; i < pathParts.length; i++) {
      const partialPath = pathParts.slice(0, i + 1).join(path.sep);
      if (CONFIG.HANDLEIDINGEN_DIR_PATTERN.test(partialPath)) {
        return true;
      }
    }
    
    return false;
  }
  
  traverseDir(baseDir);
  return { directories, handleidingenDirs, files: filesToUpload };
}

// Create directory structure in Supabase
async function createDirectoryStructure(directories) {
  for (const dir of directories) {
    try {
      // Create an empty file to establish the directory
      const emptyFile = new Uint8Array(0);
      const folderPath = `${dir}/.folder`;
      
      // Check if directory already exists
      const { data: existingFiles, error: listError } = await supabase.storage
        .from(CONFIG.STORAGE_BUCKET)
        .list(dir);
        
      if (listError && listError.message !== 'The resource was not found') {
        throw listError;
      }
      
      if (existingFiles && existingFiles.length > 0) {
        console.log(`   ✅ Directory already exists: ${dir}`);
        continue;
      }
      
      // Create directory by uploading an empty file
      const { error: uploadError } = await supabase.storage
        .from(CONFIG.STORAGE_BUCKET)
        .upload(folderPath, emptyFile);
        
      if (uploadError) {
        throw uploadError;
      }
      
      stats.createdDirectories++;
      console.log(`   ✅ Created directory: ${dir}`);
    } catch (error) {
      console.error(`   ❌ Failed to create directory ${dir}: ${error.message}`);
    }
  }
}

// Process a single file
async function processFile(file) {
  try {
    console.log(`🔄 Processing: ${file.relativePath} (${formatFileSize(file.size)})`);

    // Extract category from path
    const pathParts = file.relativePath.split(path.sep);
    let category = 'Handleidingen';
    
    // Try to find a meaningful category from the path
    for (let i = 0; i < pathParts.length; i++) {
      if (CONFIG.HANDLEIDINGEN_DIR_PATTERN.test(pathParts[i])) {
        // Use the next directory level as category if available
        if (i + 1 < pathParts.length) {
          category = pathParts[i + 1];
        }
        break;
      }
    }
    
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
          .upload(file.relativePath, fileStream, {
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
    
    // Save metadata to database
    const { data: metadataData, error: metadataError } = await supabase
      .from('documents_metadata')
      .insert({
        filename: file.name,
        safe_filename: file.name,
        storage_path: file.relativePath,
        file_size: file.size,
        mime_type: file.mimeType,
        afdeling: 'Technisch',
        categorie: category,
        onderwerp: path.basename(file.name, path.extname(file.name)),
        versie: extractVersion(file.name),
        uploaded_by: 'full-structure-upload-script',
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
    
    // Track category stats
    if (!stats.categories[category]) {
      stats.categories[category] = {
        total: 1,
        uploaded: 1,
        skipped: 0,
        failed: 0,
        bytes: file.size
      };
    } else {
      stats.categories[category].total++;
      stats.categories[category].uploaded++;
      stats.categories[category].bytes += file.size;
    }
    
    console.log(`✅ Uploaded: ${file.name} (${formatFileSize(file.size)})`);
    
  } catch (error) {
    stats.failedFiles++;
    
    // Track category stats for failures
    const pathParts = file.relativePath.split(path.sep);
    let category = 'Handleidingen';
    
    // Try to find a meaningful category from the path
    for (let i = 0; i < pathParts.length; i++) {
      if (CONFIG.HANDLEIDINGEN_DIR_PATTERN.test(pathParts[i])) {
        // Use the next directory level as category if available
        if (i + 1 < pathParts.length) {
          category = pathParts[i + 1];
        }
        break;
      }
    }
    
    if (!stats.categories[category]) {
      stats.categories[category] = {
        total: 1,
        uploaded: 0,
        skipped: 0,
        failed: 1,
        bytes: 0
      };
    } else {
      stats.categories[category].total++;
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
  
  console.log('\n📋 Full Structure Upload Report');
  console.log('=============================');
  console.log(`📂 Source: ${CONFIG.SOURCE_DIR}`);
  console.log(`⏱️ Duration: ${elapsedFormatted}`);
  console.log('');
  console.log('📊 Directory Statistics:');
  console.log(`   Total directories found: ${stats.totalDirectories}`);
  console.log(`   Directories created: ${stats.createdDirectories}`);
  console.log('');
  console.log('📊 File Statistics:');
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
  
  if (Object.keys(stats.categories).length > 0) {
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
      handleidingenPattern: CONFIG.HANDLEIDINGEN_DIR_PATTERN.toString(),
      maxFileSize: CONFIG.MAX_FILE_SIZE
    },
    statistics: {
      totalDirectories: stats.totalDirectories,
      createdDirectories: stats.createdDirectories,
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
  
  const reportPath = path.join(process.cwd(), 'full-structure-upload-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  
  // Provide next steps
  console.log('\n🚀 Next Steps:');
  console.log('   - Process uploaded files through the RAG pipeline');
  console.log('   - Verify document metadata in the admin dashboard');
  console.log('   - Run verification script to ensure all files were uploaded correctly');
  
  console.log('\n✅ Upload completed!');
}

// Start the script
main().catch(console.error);