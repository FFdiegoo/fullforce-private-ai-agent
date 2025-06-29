#!/usr/bin/env node

/**
 * Create Folder Structure in Supabase Storage
 * 
 * This script creates the folder structure in Supabase Storage
 * to match the structure on the hard drive.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  STORAGE_BUCKET: 'company-docs',
};

// Validate configuration
if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials. Please check your .env.local file.');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Folder structure to create based on the screenshot
const folderStructure = [
  '010 Atex',
  '020 Koeling',
  '030 Ontvochtiging',
  '040 Ventilatie',
  '050 Verwarming',
  '060 Luchtreiniging',
  '070 Bevochtiging',
  '080 Koopartikelen',
  '090 Algemeen',
  '100 Diensten',
  '110 CSrental',
  '120 Handleidingen',
  'MISC',
  'inkoop',
  'techniek',
  'test-documents'
];

// Main function
async function main() {
  console.log('🚀 Creating Folder Structure in Supabase Storage');
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

    // Create each folder
    console.log('🔍 Creating folder structure...');
    
    for (const folder of folderStructure) {
      try {
        // Create an empty file to establish the folder
        const emptyFile = new Uint8Array(0);
        const folderPath = `${folder}/.folder`;
        
        // Check if folder already exists
        const { data: existingFiles, error: listError } = await supabase.storage
          .from(CONFIG.STORAGE_BUCKET)
          .list(folder);
          
        if (listError && listError.message !== 'The resource was not found') {
          throw listError;
        }
        
        if (existingFiles && existingFiles.length > 0) {
          console.log(`   ✅ Folder already exists: ${folder}`);
          continue;
        }
        
        // Create folder by uploading an empty file
        const { error: uploadError } = await supabase.storage
          .from(CONFIG.STORAGE_BUCKET)
          .upload(folderPath, emptyFile);
          
        if (uploadError) {
          throw uploadError;
        }
        
        console.log(`   ✅ Created folder: ${folder}`);
      } catch (error) {
        console.error(`   ❌ Failed to create folder ${folder}: ${error.message}`);
      }
    }

    console.log('\n🎉 Folder structure created successfully!');
    console.log('You can now upload files to these folders.');

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Start the script
main().catch(console.error);