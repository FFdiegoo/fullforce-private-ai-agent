#!/usr/bin/env ts-node

/**
 * Bulk Upload Script for D:\ Drive to Supabase Storage
 * 
 * This script recursively scans all files in D:\ and uploads them to Supabase Storage
 * while preserving the original folder structure.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

// Load environment variables
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  SOURCE_PATH: 'D:\\',
  BUCKET_NAME: 'company_documents',
  MAX_FILE_SIZE: 1024 * 1024 * 1024, // 1GB
  CONCURRENT_UPLOADS: 5,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
};

// Validate environment variables
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Promisify fs functions
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);

// Types
interface UploadResult {
  filePath: string;
  storagePath: string;
  success: boolean;
  error?: string;
  fileSize: number;
  signedUrl?: string;
}

interface UploadStats {
  totalFiles: number;
  processedFiles: number;
  successfulUploads: number;
  failedUploads: number;
  skippedFiles: number;
  totalSize: number;
  uploadedSize: number;
  startTime: Date;
  endTime?: Date;
}

// Global stats
const stats: UploadStats = {
  totalFiles: 0,
  processedFiles: 0,
  successfulUploads: 0,
  failedUploads: 0,
  skippedFiles: 0,
  totalSize: 0,
  uploadedSize: 0,
  startTime: new Date()
};

// Results storage
const results: UploadResult[] = [];

/**
 * Check if file should be skipped based on extension or path
 */
function shouldSkipFile(filePath: string): boolean {
  const skipExtensions = [
    '.tmp', '.temp', '.log', '.cache', '.lock',
    '.sys', '.dll', '.exe', '.msi', '.bat', '.cmd',
    '.lnk', '.url', '.ini', '.db', '.thumbs'
  ];
  
  const skipPaths = [
    'System Volume Information',
    '$RECYCLE.BIN',
    'pagefile.sys',
    'hiberfil.sys',
    'swapfile.sys',
    'Windows',
    'Program Files',
    'Program Files (x86)',
    'ProgramData',
    'Users\\Default',
    'Users\\Public',
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build'
  ];

  const ext = path.extname(filePath).toLowerCase();
  if (skipExtensions.includes(ext)) {
    return true;
  }

  const normalizedPath = filePath.replace(/\\/g, '/');
  return skipPaths.some(skipPath => 
    normalizedPath.includes(skipPath.replace(/\\/g, '/'))
  );
}

/**
 * Get MIME type based on file extension
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.rtf': 'application/rtf'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Convert Windows path to storage path
 */
function getStoragePath(filePath: string): string {
  // Remove D:\ prefix and convert backslashes to forward slashes
  const relativePath = path.relative(CONFIG.SOURCE_PATH, filePath);
  return relativePath.replace(/\\/g, '/');
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Upload a single file to Supabase Storage with retry logic
 */
async function uploadFile(filePath: string, retryCount = 0): Promise<UploadResult> {
  const storagePath = getStoragePath(filePath);
  
  try {
    // Read file
    const fileBuffer = await readFile(filePath);
    const fileSize = fileBuffer.length;
    
    // Check file size limit
    if (fileSize > CONFIG.MAX_FILE_SIZE) {
      return {
        filePath,
        storagePath,
        success: false,
        error: `File too large: ${formatFileSize(fileSize)} (max: ${formatFileSize(CONFIG.MAX_FILE_SIZE)})`,
        fileSize
      };
    }

    // Get MIME type
    const mimeType = getMimeType(filePath);
    
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(CONFIG.BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true, // Overwrite if exists
        duplex: 'half'
      });

    if (error) {
      throw new Error(error.message);
    }

    // Generate signed URL for public access
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(CONFIG.BUCKET_NAME)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year expiry

    const signedUrl = urlError ? undefined : signedUrlData?.signedUrl;

    stats.uploadedSize += fileSize;

    return {
      filePath,
      storagePath,
      success: true,
      fileSize,
      signedUrl
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Retry logic
    if (retryCount < CONFIG.RETRY_ATTEMPTS) {
      console.log(`   ⚠️ Retry ${retryCount + 1}/${CONFIG.RETRY_ATTEMPTS} for: ${path.basename(filePath)}`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * (retryCount + 1)));
      return uploadFile(filePath, retryCount + 1);
    }

    return {
      filePath,
      storagePath,
      success: false,
      error: errorMessage,
      fileSize: 0
    };
  }
}

/**
 * Recursively scan directory and collect all file paths
 */
async function scanDirectory(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await readdir(dirPath);
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      
      try {
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
          // Skip certain system directories
          if (shouldSkipFile(fullPath)) {
            console.log(`   ⏩ Skipping directory: ${fullPath}`);
            continue;
          }
          
          // Recursively scan subdirectory
          const subFiles = await scanDirectory(fullPath);
          files.push(...subFiles);
        } else if (stats.isFile()) {
          // Skip certain file types
          if (shouldSkipFile(fullPath)) {
            console.log(`   ⏩ Skipping file: ${fullPath}`);
            continue;
          }
          
          files.push(fullPath);
        }
      } catch (error) {
        console.log(`   ⚠️ Cannot access: ${fullPath} (${error instanceof Error ? error.message : 'Unknown error'})`);
      }
    }
  } catch (error) {
    console.error(`❌ Error scanning directory ${dirPath}:`, error instanceof Error ? error.message : 'Unknown error');
  }
  
  return files;
}

/**
 * Process files in batches with concurrency control
 */
async function processFilesInBatches(files: string[]): Promise<void> {
  console.log(`📦 Processing ${files.length} files in batches of ${CONFIG.CONCURRENT_UPLOADS}...`);
  
  for (let i = 0; i < files.length; i += CONFIG.CONCURRENT_UPLOADS) {
    const batch = files.slice(i, i + CONFIG.CONCURRENT_UPLOADS);
    const batchNumber = Math.floor(i / CONFIG.CONCURRENT_UPLOADS) + 1;
    const totalBatches = Math.ceil(files.length / CONFIG.CONCURRENT_UPLOADS);
    
    console.log(`\n📋 Batch ${batchNumber}/${totalBatches} (${batch.length} files):`);
    
    // Process batch concurrently
    const batchPromises = batch.map(async (filePath) => {
      const fileName = path.basename(filePath);
      const fileStats = await stat(filePath);
      
      console.log(`   📄 Uploading: ${fileName} (${formatFileSize(fileStats.size)})`);
      
      const result = await uploadFile(filePath);
      results.push(result);
      
      stats.processedFiles++;
      
      if (result.success) {
        stats.successfulUploads++;
        console.log(`   ✅ ${fileName} → ${result.storagePath}`);
      } else {
        stats.failedUploads++;
        console.log(`   ❌ ${fileName}: ${result.error}`);
      }
      
      return result;
    });
    
    await Promise.all(batchPromises);
    
    // Progress update
    const progress = ((stats.processedFiles / files.length) * 100).toFixed(1);
    console.log(`   📊 Progress: ${stats.processedFiles}/${files.length} (${progress}%)`);
  }
}

/**
 * Ensure bucket exists
 */
async function ensureBucketExists(): Promise<boolean> {
  console.log('🪣 Checking if bucket exists...');
  
  try {
    // Try to get bucket info
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      throw listError;
    }
    
    const bucketExists = buckets?.some(bucket => bucket.name === CONFIG.BUCKET_NAME);
    
    if (bucketExists) {
      console.log(`✅ Bucket '${CONFIG.BUCKET_NAME}' already exists`);
      return true;
    }
    
    // Create bucket if it doesn't exist
    console.log(`🆕 Creating bucket '${CONFIG.BUCKET_NAME}'...`);
    const { error: createError } = await supabase.storage.createBucket(CONFIG.BUCKET_NAME, {
      public: true,
      allowedMimeTypes: undefined, // Allow all file types
      fileSizeLimit: CONFIG.MAX_FILE_SIZE
    });
    
    if (createError) {
      throw createError;
    }
    
    console.log(`✅ Bucket '${CONFIG.BUCKET_NAME}' created successfully`);
    return true;
    
  } catch (error) {
    console.error(`❌ Bucket setup failed:`, error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

/**
 * Generate final report
 */
function generateReport(): void {
  stats.endTime = new Date();
  const duration = stats.endTime.getTime() - stats.startTime.getTime();
  const durationMinutes = Math.round(duration / 60000);
  
  console.log('\n' + '='.repeat(80));
  console.log('📋 BULK UPLOAD REPORT');
  console.log('='.repeat(80));
  console.log(`📊 Summary:`);
  console.log(`   Total files found: ${stats.totalFiles}`);
  console.log(`   Files processed: ${stats.processedFiles}`);
  console.log(`   Successful uploads: ${stats.successfulUploads}`);
  console.log(`   Failed uploads: ${stats.failedUploads}`);
  console.log(`   Skipped files: ${stats.skippedFiles}`);
  console.log(`   Success rate: ${stats.totalFiles > 0 ? ((stats.successfulUploads / stats.totalFiles) * 100).toFixed(1) : 0}%`);
  console.log(`   Total size scanned: ${formatFileSize(stats.totalSize)}`);
  console.log(`   Total size uploaded: ${formatFileSize(stats.uploadedSize)}`);
  console.log(`   Duration: ${durationMinutes} minutes`);
  
  // Show failed uploads
  const failedResults = results.filter(r => !r.success);
  if (failedResults.length > 0) {
    console.log(`\n❌ Failed uploads (${failedResults.length}):`);
    failedResults.slice(0, 10).forEach(result => {
      console.log(`   - ${path.basename(result.filePath)}: ${result.error}`);
    });
    
    if (failedResults.length > 10) {
      console.log(`   ... and ${failedResults.length - 10} more failures`);
    }
  }
  
  // Save detailed report to file
  const reportData = {
    timestamp: stats.endTime.toISOString(),
    config: {
      sourcePath: CONFIG.SOURCE_PATH,
      bucketName: CONFIG.BUCKET_NAME,
      maxFileSize: CONFIG.MAX_FILE_SIZE,
      concurrentUploads: CONFIG.CONCURRENT_UPLOADS
    },
    stats,
    results: results.map(r => ({
      filePath: r.filePath,
      storagePath: r.storagePath,
      success: r.success,
      error: r.error,
      fileSize: r.fileSize,
      hasSignedUrl: !!r.signedUrl
    }))
  };
  
  const reportPath = path.join(process.cwd(), `bulk-upload-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  console.log('🚀 Starting Bulk Upload from D:\\ to Supabase Storage');
  console.log('='.repeat(60));
  console.log(`📂 Source: ${CONFIG.SOURCE_PATH}`);
  console.log(`🪣 Bucket: ${CONFIG.BUCKET_NAME}`);
  console.log(`⚡ Concurrent uploads: ${CONFIG.CONCURRENT_UPLOADS}`);
  console.log(`📏 Max file size: ${formatFileSize(CONFIG.MAX_FILE_SIZE)}`);
  console.log('');

  try {
    // Step 1: Ensure bucket exists
    const bucketReady = await ensureBucketExists();
    if (!bucketReady) {
      throw new Error('Failed to setup bucket');
    }

    // Step 2: Scan all files
    console.log('🔍 Scanning D:\\ for files...');
    const allFiles = await scanDirectory(CONFIG.SOURCE_PATH);
    
    stats.totalFiles = allFiles.length;
    
    if (allFiles.length === 0) {
      console.log('⚠️ No files found to upload');
      return;
    }
    
    // Calculate total size
    console.log('📊 Calculating total size...');
    for (const filePath of allFiles) {
      try {
        const fileStats = await stat(filePath);
        stats.totalSize += fileStats.size;
      } catch (error) {
        // File might have been deleted or become inaccessible
        stats.skippedFiles++;
      }
    }
    
    console.log(`📋 Scan complete:`);
    console.log(`   Files found: ${stats.totalFiles}`);
    console.log(`   Total size: ${formatFileSize(stats.totalSize)}`);
    console.log(`   Estimated upload time: ${Math.round(stats.totalSize / (1024 * 1024 * 10))} minutes (assuming 10MB/s)`);
    
    // Ask for confirmation
    console.log('\n⚠️ This will upload ALL files from D:\\ to Supabase Storage.');
    console.log('Press Ctrl+C to cancel, or wait 10 seconds to continue...');
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Step 3: Process files
    await processFilesInBatches(allFiles);
    
    // Step 4: Generate report
    generateReport();
    
    console.log('\n🎉 Bulk upload completed!');
    
  } catch (error) {
    console.error('\n❌ Bulk upload failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️ Upload interrupted by user');
  generateReport();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️ Upload terminated');
  generateReport();
  process.exit(0);
});

// Start the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { main, uploadFile, scanDirectory };