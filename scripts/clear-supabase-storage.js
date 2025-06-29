#!/usr/bin/env node

/**
 * Clear Supabase Storage Bucket
 * 
 * This script deletes all files and folders from a Supabase storage bucket
 * to provide a fresh start for uploading new documents.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  STORAGE_BUCKET: 'company-docs',
  BATCH_SIZE: 100, // Number of files to delete in a single batch
  CONFIRM_DELETION: true, // Set to false to skip confirmation prompt
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
  console.log('🧹 Supabase Storage Cleanup Tool');
  console.log('==============================');
  console.log(`🔗 Supabase URL: ${CONFIG.SUPABASE_URL}`);
  console.log(`🪣 Storage bucket: ${CONFIG.STORAGE_BUCKET}`);
  console.log('');

  try {
    // Verify Supabase connection
    console.log('🔍 Verifying Supabase connection...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

    if (bucketsError) {
      throw new Error(`Supabase connection failed: ${bucketsError.message}`);
    }

    // Check if bucket exists
    const bucketExists = buckets.some(bucket => bucket.name === CONFIG.STORAGE_BUCKET);
    if (!bucketExists) {
      throw new Error(`Storage bucket '${CONFIG.STORAGE_BUCKET}' does not exist`);
    }
    console.log(`✅ Connected to Supabase and found bucket: ${CONFIG.STORAGE_BUCKET}`);

    // List all files in the bucket
    console.log('🔍 Listing all files in storage bucket...');
    const allFiles = await listAllFiles(CONFIG.STORAGE_BUCKET);
    console.log(`📊 Found ${allFiles.length} files in the bucket`);

    // Also clear the documents_metadata table
    console.log('🔍 Checking documents_metadata table...');
    const { count, error: countError } = await supabase
      .from('documents_metadata')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.warn(`⚠️ Could not check documents_metadata table: ${countError.message}`);
    } else {
      console.log(`📊 Found ${count} records in documents_metadata table`);
    }

    // Confirm deletion
    if (CONFIG.CONFIRM_DELETION && allFiles.length > 0) {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        readline.question(`⚠️ Are you sure you want to delete ALL ${allFiles.length} files from the '${CONFIG.STORAGE_BUCKET}' bucket and clear the documents_metadata table? This action cannot be undone! (y/n): `, resolve);
      });

      readline.close();

      if (answer.toLowerCase() !== 'y') {
        console.log('❌ Operation cancelled by user');
        process.exit(0);
      }
    }

    // Delete all files
    if (allFiles.length > 0) {
      console.log('🗑️ Deleting all files from storage bucket...');
      await deleteAllFiles(CONFIG.STORAGE_BUCKET, allFiles);
      console.log(`✅ Successfully deleted ${allFiles.length} files from storage`);
    } else {
      console.log('✅ Storage bucket is already empty');
    }

    // Clear documents_metadata table
    console.log('🗑️ Clearing documents_metadata table...');
    const { error: deleteError } = await supabase
      .from('documents_metadata')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records

    if (deleteError) {
      console.error(`❌ Failed to clear documents_metadata table: ${deleteError.message}`);
    } else {
      console.log('✅ Successfully cleared documents_metadata table');
    }

    console.log('\n🎉 Storage bucket and metadata table have been cleared successfully!');
    console.log('You can now upload new documents to start fresh.');

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// List all files in a bucket recursively
async function listAllFiles(bucketName, path = '', allFiles = []) {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(path);

    if (error) {
      throw error;
    }

    // Process files and folders
    for (const item of data) {
      const fullPath = path ? `${path}/${item.name}` : item.name;
      
      if (item.id) {
        // It's a file
        allFiles.push(fullPath);
      } else {
        // It's a folder, recurse into it
        await listAllFiles(bucketName, fullPath, allFiles);
      }
    }

    return allFiles;
  } catch (error) {
    console.error(`Error listing files: ${error.message}`);
    return allFiles;
  }
}

// Delete all files in batches
async function deleteAllFiles(bucketName, files) {
  // Split files into batches
  const batches = [];
  for (let i = 0; i < files.length; i += CONFIG.BATCH_SIZE) {
    batches.push(files.slice(i, i + CONFIG.BATCH_SIZE));
  }

  console.log(`📦 Created ${batches.length} deletion batches`);

  // Process each batch
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} files)`);

    const { data, error } = await supabase.storage
      .from(bucketName)
      .remove(batch);

    if (error) {
      console.error(`❌ Error in batch ${i + 1}: ${error.message}`);
    } else {
      console.log(`✅ Batch ${i + 1} deleted successfully`);
    }

    // Small delay between batches to avoid rate limiting
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Start the script
main().catch(console.error);