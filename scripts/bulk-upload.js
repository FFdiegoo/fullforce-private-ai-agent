#!/usr/bin/env node

/**
 * Bulk Upload Script for Supabase
 * 
 * This script uploads documents from a local directory to Supabase Storage
 * and stores metadata in the documents_metadata table.
 * 
 * Features:
 * - Parallel processing with worker threads
 * - Batch processing to manage memory usage
 * - Progress tracking and reporting
 * - Error handling and retry logic
 * - Metadata extraction from file paths or names
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  CONCURRENT_WORKERS: 4,
  BATCH_SIZE: 25,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000, // ms
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  STORAGE_BUCKET: 'company-docs',
  DOCUMENT_SOURCE_DIR: process.argv[2] || '', // First argument is the source directory
  METADATA_EXTRACTION: 'path', // 'path', 'filename', or 'manual'
};

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.doc', '.odt', '.csv', '.rtf'];

// Validate configuration
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials. Please check your .env.local file.');
  process.exit(1);
}

if (!CONFIG.DOCUMENT_SOURCE_DIR) {
  console.error('❌ Please provide a source directory as an argument:');
  console.error('   npm run bulk-upload /path/to/your/documents');
  process.exit(1);
}

if (!fs.existsSync(CONFIG.DOCUMENT_SOURCE_DIR)) {
  console.error(`❌ Source directory does not exist: ${CONFIG.DOCUMENT_SOURCE_DIR}`);
  process.exit(1);
}

// Main thread logic
if (isMainThread) {
  console.log('🚀 Starting Bulk Upload to Supabase');
  console.log(`📂 Source directory: ${CONFIG.DOCUMENT_SOURCE_DIR}`);
  console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`🪣 Storage bucket: ${CONFIG.STORAGE_BUCKET}`);
  console.log(`👷 Workers: ${CONFIG.CONCURRENT_WORKERS}`);
  console.log(`📦 Batch size: ${CONFIG.BATCH_SIZE}`);
  console.log(`📋 Supported file types: ${SUPPORTED_EXTENSIONS.join(', ')}`);
  console.log('');

  // Initialize Supabase client for the main thread
  const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

  async function main() {
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
        const { error: createError } = await supabase
          .storage
          .createBucket(CONFIG.STORAGE_BUCKET, { public: false });

        if (createError) {
          throw new Error(`Failed to create bucket: ${createError.message}`);
        }
        console.log(`✅ Bucket '${CONFIG.STORAGE_BUCKET}' created successfully`);
      } else {
        console.log(`✅ Bucket '${CONFIG.STORAGE_BUCKET}' exists`);
      }

      // Get all files recursively
      console.log('📂 Scanning directory for files...');
      const files = getAllFiles(CONFIG.DOCUMENT_SOURCE_DIR);
      console.log(`📊 Found ${files.length} files`);

      // Create migration progress record
      const { data: progressData, error: progressError } = await supabase
        .from('migration_progress')
        .insert({
          total_files: files.length,
          uploaded_files: 0,
          processed_files: 0,
          failed_files: 0,
          status: 'running',
          estimated_completion: new Date(Date.now() + (files.length * 5000)) // Rough estimate
        })
        .select();

      if (progressError) {
        console.warn(`⚠️ Could not create migration progress record: ${progressError.message}`);
      } else {
        console.log(`✅ Created migration progress record with ID: ${progressData[0].id}`);
      }

      // Split files into batches
      const batches = chunkArray(files, CONFIG.BATCH_SIZE);
      console.log(`📦 Created ${batches.length} batches`);

      // Create and start workers
      const workers = [];
      const workersData = [];
      
      for (let i = 0; i < CONFIG.CONCURRENT_WORKERS; i++) {
        const workerBatches = batches.filter((_, index) => index % CONFIG.CONCURRENT_WORKERS === i);
        
        workersData.push({
          workerId: i,
          batches: workerBatches,
          totalFiles: workerBatches.reduce((sum, batch) => sum + batch.length, 0)
        });
        
        const worker = new Worker(__filename, {
          workerData: workersData[i]
        });
        
        worker.on('message', (msg) => {
          if (msg.type === 'log') {
            console.log(`[Worker ${i}] ${msg.message}`);
          } else if (msg.type === 'progress') {
            updateProgress(msg.uploaded, msg.failed);
          } else if (msg.type === 'error') {
            console.error(`[Worker ${i}] ❌ ${msg.message}`);
          }
        });
        
        worker.on('error', (err) => {
          console.error(`[Worker ${i}] ❌ Worker error: ${err.message}`);
        });
        
        worker.on('exit', (code) => {
          if (code !== 0) {
            console.error(`[Worker ${i}] ❌ Worker stopped with exit code ${code}`);
          } else {
            console.log(`[Worker ${i}] ✅ Completed all tasks`);
          }
        });
        
        workers.push(worker);
      }

      console.log(`🚀 Started ${workers.length} workers`);
      
      // Wait for all workers to complete
      await Promise.all(workers.map(worker => {
        return new Promise((resolve) => {
          worker.on('exit', resolve);
        });
      }));

      // Update migration progress to completed
      await supabase
        .from('migration_progress')
        .update({
          status: 'completed',
          estimated_completion: new Date()
        })
        .eq('total_files', files.length);

      console.log('✅ All workers completed');
      console.log('🎉 Bulk upload completed successfully!');
      
    } catch (error) {
      console.error(`❌ Error in main process: ${error.message}`);
      process.exit(1);
    }
  }

  // Track overall progress
  let uploadedCount = 0;
  let failedCount = 0;
  
  async function updateProgress(uploaded, failed) {
    uploadedCount += uploaded;
    failedCount += failed;
    
    const totalFiles = getAllFiles(CONFIG.DOCUMENT_SOURCE_DIR).length;
    const progressPercent = ((uploadedCount + failedCount) / totalFiles * 100).toFixed(2);
    
    console.log(`📊 Progress: ${progressPercent}% (${uploadedCount} uploaded, ${failedCount} failed, ${totalFiles - uploadedCount - failedCount} remaining)`);
    
    try {
      await supabase
        .from('migration_progress')
        .update({
          uploaded_files: uploadedCount,
          failed_files: failedCount,
          estimated_completion: new Date(Date.now() + ((totalFiles - uploadedCount - failedCount) * 5000))
        })
        .eq('total_files', totalFiles);
    } catch (error) {
      console.warn(`⚠️ Could not update progress: ${error.message}`);
    }
  }

  // Start the main process
  main().catch(console.error);
} 
// Worker thread logic
else {
  const { workerId, batches, totalFiles } = workerData;
  
  // Initialize Supabase client for the worker
  const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  
  async function processWorkerBatches() {
    parentPort.postMessage({ type: 'log', message: `Starting to process ${totalFiles} files in ${batches.length} batches` });
    
    let uploadedCount = 0;
    let failedCount = 0;
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      parentPort.postMessage({ type: 'log', message: `Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} files)` });
      
      for (const filePath of batch) {
        try {
          const result = await uploadFile(filePath);
          
          if (result.success) {
            uploadedCount++;
          } else {
            failedCount++;
          }
          
          // Report progress after each file
          if ((uploadedCount + failedCount) % 5 === 0 || (uploadedCount + failedCount) === totalFiles) {
            parentPort.postMessage({ 
              type: 'progress', 
              uploaded: uploadedCount, 
              failed: failedCount 
            });
            
            // Reset counters after reporting
            uploadedCount = 0;
            failedCount = 0;
          }
          
        } catch (error) {
          parentPort.postMessage({ type: 'error', message: `Error processing ${filePath}: ${error.message}` });
          failedCount++;
        }
      }
    }
    
    parentPort.postMessage({ type: 'log', message: 'Completed all batches' });
  }
  
  async function uploadFile(filePath) {
    const fileName = path.basename(filePath);
    parentPort.postMessage({ type: 'log', message: `Processing: ${fileName}` });

    try {
      const ext = path.extname(fileName).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        parentPort.postMessage({ type: 'log', message: `Skipping unsupported file type: ${fileName}` });
        return { success: false, filename: fileName, error: 'Unsupported file type' };
      }

      // Extract metadata from file path or name
      const metadata = extractMetadata(filePath);
      
      // Generate a safe filename with timestamp and UUID
      const timestamp = Date.now();
      const uniqueId = uuidv4().substring(0, 8);
      const safeFileName = `${timestamp}_${uniqueId}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      // Determine storage path
      const relativePath = path.relative(CONFIG.DOCUMENT_SOURCE_DIR, filePath);
      const dirPath = path.dirname(relativePath);
      const storagePath = dirPath !== '.' 
        ? `${dirPath.replace(/\\/g, '/')}/${safeFileName}`
        : safeFileName;
      
      // Get file stats
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;
      
      // Determine MIME type
      const mimeType = mime.lookup(filePath) || 'application/octet-stream';
      
      // Create read stream for file
      const fileStream = fs.createReadStream(filePath);
      
      // Retry logic for upload
      let uploadAttempt = 0;
      let uploadSuccess = false;
      let uploadError = null;
      let storageData = null;
      
      while (uploadAttempt < CONFIG.RETRY_ATTEMPTS && !uploadSuccess) {
        uploadAttempt++;
        
        try {
          // Upload to Supabase Storage
          const uploadResult = await supabase.storage
            .from(CONFIG.STORAGE_BUCKET)
            .upload(storagePath, fileStream, {
              contentType: mimeType,
              upsert: false,
              duplex: 'half' // Optimize for large files
            });
          
          if (uploadResult.error) {
            throw uploadResult.error;
          }
          
          storageData = uploadResult.data;
          uploadSuccess = true;
          
        } catch (error) {
          uploadError = error;
          
          // If not the last attempt, wait before retrying
          if (uploadAttempt < CONFIG.RETRY_ATTEMPTS) {
            parentPort.postMessage({ type: 'log', message: `Upload attempt ${uploadAttempt} failed for ${fileName}, retrying...` });
            await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
            
            // Create a new file stream for the retry
            fileStream.destroy();
            const newFileStream = fs.createReadStream(filePath);
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
          filename: fileName,
          safe_filename: safeFileName,
          storage_path: storagePath,
          file_size: fileSize,
          mime_type: mimeType,
          afdeling: metadata.department,
          categorie: metadata.category,
          onderwerp: metadata.subject,
          versie: metadata.version,
          uploaded_by: 'bulk-upload-script',
          last_updated: new Date().toISOString(),
          ready_for_indexing: true,
          processed: false
        })
        .select();
      
      if (metadataError) {
        throw metadataError;
      }
      
      parentPort.postMessage({ type: 'log', message: `✅ Uploaded: ${fileName} (${formatFileSize(fileSize)})` });
      
      return {
        success: true,
        documentId: metadataData[0].id,
        filename: fileName,
        size: fileSize
      };
      
    } catch (error) {
      parentPort.postMessage({ type: 'error', message: `Failed to upload ${fileName}: ${error.message}` });
      
      return {
        success: false,
        filename: fileName,
        error: error.message
      };
    }
  }
  
  // Start processing
  processWorkerBatches().catch(error => {
    parentPort.postMessage({ type: 'error', message: `Worker error: ${error.message}` });
    process.exit(1);
  });
}

// Helper function to get all files recursively
function getAllFiles(dir) {
  const files = [];
  
  function traverseDir(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        traverseDir(fullPath);
      } else {
        // Skip hidden files and temporary files
        if (!entry.name.startsWith('.') && !entry.name.endsWith('~')) {
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.includes(ext)) {
            files.push(fullPath);
          } else {
            console.warn(`⚠️ Skipping unsupported file type: ${fullPath}`);
          }
        }
      }
    }
  }
  
  traverseDir(dir);
  return files;
}

// Helper function to split array into chunks
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Helper function to extract metadata from file path or name
function extractMetadata(filePath) {
  const fileName = path.basename(filePath);
  const dirPath = path.dirname(filePath);
  const dirParts = dirPath.split(path.sep);
  
  // Default metadata
  const metadata = {
    department: 'Unknown',
    category: 'Unknown',
    subject: fileName.replace(/\.[^/.]+$/, ''), // Remove extension
    version: '1.0'
  };
  
  if (CONFIG.METADATA_EXTRACTION === 'path') {
    // Extract from path structure
    // Assuming path structure like: /path/to/Department/Category/Subject_v1.0.pdf
    
    // Get department from the first directory after the source dir
    const relPath = path.relative(CONFIG.DOCUMENT_SOURCE_DIR, dirPath);
    const relParts = relPath.split(path.sep).filter(Boolean);
    
    if (relParts.length >= 1) {
      metadata.department = relParts[0];
    }
    
    if (relParts.length >= 2) {
      metadata.category = relParts[1];
    }
    
    // Try to extract version from filename (e.g., "document_v1.0.pdf")
    const versionMatch = fileName.match(/_v(\d+\.\d+)/);
    if (versionMatch) {
      metadata.version = versionMatch[1];
      // Remove version from subject
      metadata.subject = metadata.subject.replace(/_v\d+\.\d+$/, '');
    }
  } else if (CONFIG.METADATA_EXTRACTION === 'filename') {
    // Extract from filename pattern
    // Assuming filename like: Department_Category_Subject_v1.0.pdf
    
    const parts = fileName.replace(/\.[^/.]+$/, '').split('_');
    
    if (parts.length >= 1) {
      metadata.department = parts[0];
    }
    
    if (parts.length >= 2) {
      metadata.category = parts[1];
    }
    
    if (parts.length >= 3) {
      // Check if last part is version
      const lastPart = parts[parts.length - 1];
      if (lastPart.startsWith('v') && /v\d+\.\d+/.test(lastPart)) {
        metadata.version = lastPart.substring(1);
        metadata.subject = parts.slice(2, parts.length - 1).join('_');
      } else {
        metadata.subject = parts.slice(2).join('_');
      }
    }
  }
  
  return metadata;
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}