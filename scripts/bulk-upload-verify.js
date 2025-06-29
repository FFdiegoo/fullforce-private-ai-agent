#!/usr/bin/env node

/**
 * Bulk Upload Verification Script
 * 
 * This script verifies that documents were correctly uploaded to Supabase
 * and checks for any discrepancies between local files and uploaded files.
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
};

// Validate configuration
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials. Please check your .env.local file.');
  process.exit(1);
}

if (!CONFIG.SOURCE_DIR) {
  console.error('❌ Please provide a source directory as an argument:');
  console.error('   npm run verify-upload /path/to/your/documents');
  process.exit(1);
}

if (!fs.existsSync(CONFIG.SOURCE_DIR)) {
  console.error(`❌ Source directory does not exist: ${CONFIG.SOURCE_DIR}`);
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Main function
async function main() {
  console.log('🔍 Starting Bulk Upload Verification');
  console.log(`📂 Source directory: ${CONFIG.SOURCE_DIR}`);
  console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`🪣 Storage bucket: ${CONFIG.STORAGE_BUCKET}`);
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

    // Get all local files
    console.log('📂 Scanning local directory...');
    const localFiles = getAllFiles(CONFIG.SOURCE_DIR);
    console.log(`📊 Found ${localFiles.length} local files`);

    // Get all uploaded files from database
    console.log('🔍 Fetching uploaded files from database...');
    const { data: uploadedFiles, error: fetchError } = await supabase
      .from('documents_metadata')
      .select('id, filename, storage_path, file_size, processed')
      .order('last_updated', { ascending: false });

    if (fetchError) {
      throw new Error(`Failed to fetch uploaded files: ${fetchError.message}`);
    }

    console.log(`📊 Found ${uploadedFiles.length} uploaded files in database`);

    // Compare local and uploaded files
    console.log('🔍 Comparing local and uploaded files...');
    
    // Create a map of filenames to check for duplicates
    const filenameMap = new Map();
    uploadedFiles.forEach(file => {
      const filename = file.filename;
      if (filenameMap.has(filename)) {
        filenameMap.get(filename).push(file);
      } else {
        filenameMap.set(filename, [file]);
      }
    });

    // Check for local files that haven't been uploaded
    const missingFiles = [];
    const localFilenames = new Set();
    
    localFiles.forEach(filePath => {
      const filename = path.basename(filePath);
      localFilenames.add(filename);
      
      if (!filenameMap.has(filename)) {
        missingFiles.push(filePath);
      }
    });

    // Check for uploaded files that don't exist locally
    const extraFiles = [];
    uploadedFiles.forEach(file => {
      if (!localFilenames.has(file.filename)) {
        extraFiles.push(file);
      }
    });

    // Check for duplicate uploads
    const duplicates = Array.from(filenameMap.entries())
      .filter(([_, files]) => files.length > 1)
      .map(([filename, files]) => ({
        filename,
        count: files.length,
        files
      }));

    // Check for unprocessed files
    const unprocessedFiles = uploadedFiles.filter(file => !file.processed);

    // Generate report
    console.log('\n📋 Verification Report');
    console.log('====================');
    console.log(`Total local files: ${localFiles.length}`);
    console.log(`Total uploaded files: ${uploadedFiles.length}`);
    console.log(`Missing uploads: ${missingFiles.length}`);
    console.log(`Extra uploads: ${extraFiles.length}`);
    console.log(`Duplicate uploads: ${duplicates.length}`);
    console.log(`Unprocessed files: ${unprocessedFiles.length}`);

    // Show details if there are issues
    if (missingFiles.length > 0) {
      console.log('\n❌ Missing Uploads (first 10):');
      missingFiles.slice(0, 10).forEach(file => {
        console.log(`   - ${path.relative(CONFIG.SOURCE_DIR, file)}`);
      });
      if (missingFiles.length > 10) {
        console.log(`   ... and ${missingFiles.length - 10} more`);
      }
    }

    if (duplicates.length > 0) {
      console.log('\n⚠️ Duplicate Uploads (first 5):');
      duplicates.slice(0, 5).forEach(dup => {
        console.log(`   - ${dup.filename} (${dup.count} copies)`);
      });
      if (duplicates.length > 5) {
        console.log(`   ... and ${duplicates.length - 5} more`);
      }
    }

    if (unprocessedFiles.length > 0) {
      console.log('\n⚠️ Unprocessed Files (first 10):');
      unprocessedFiles.slice(0, 10).forEach(file => {
        console.log(`   - ${file.filename} (ID: ${file.id})`);
      });
      if (unprocessedFiles.length > 10) {
        console.log(`   ... and ${unprocessedFiles.length - 10} more`);
      }
    }

    // Save detailed report to file
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        localFiles: localFiles.length,
        uploadedFiles: uploadedFiles.length,
        missingUploads: missingFiles.length,
        extraUploads: extraFiles.length,
        duplicateUploads: duplicates.length,
        unprocessedFiles: unprocessedFiles.length
      },
      details: {
        missingUploads: missingFiles.map(file => path.relative(CONFIG.SOURCE_DIR, file)),
        extraUploads: extraFiles.map(file => ({
          id: file.id,
          filename: file.filename,
          storage_path: file.storage_path
        })),
        duplicateUploads: duplicates.map(dup => ({
          filename: dup.filename,
          count: dup.count,
          ids: dup.files.map(f => f.id)
        })),
        unprocessedFiles: unprocessedFiles.map(file => ({
          id: file.id,
          filename: file.filename,
          storage_path: file.storage_path
        }))
      }
    };

    const reportPath = path.join(process.cwd(), 'upload-verification-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);

    // Provide recommendations
    console.log('\n🔧 Recommendations:');
    
    if (missingFiles.length > 0) {
      console.log('   - Run the bulk upload script again to upload missing files');
    }
    
    if (duplicates.length > 0) {
      console.log('   - Consider cleaning up duplicate uploads to save storage space');
    }
    
    if (unprocessedFiles.length > 0) {
      console.log('   - Process unprocessed files using the RAG pipeline');
    }

    if (missingFiles.length === 0 && duplicates.length === 0 && unprocessedFiles.length === 0) {
      console.log('   ✅ All files are properly uploaded and processed!');
    }

  } catch (error) {
    console.error(`\n❌ Verification failed: ${error.message}`);
    process.exit(1);
  }
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
          files.push(fullPath);
        }
      }
    }
  }
  
  traverseDir(dir);
  return files;
}

// Start the script
main().catch(console.error);