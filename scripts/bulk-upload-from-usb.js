#!/usr/bin/env node

/**
 * Bulk Upload from USB Drive
 * 
 * This script is specifically designed to upload documents from a USB drive
 * mounted on your laptop. It automatically detects common USB mount points
 * and provides an interactive interface to select the drive and start the upload.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

// Load environment variables
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

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Main function
async function main() {
  console.log('🚀 USB Drive Document Uploader');
  console.log('=============================');
  console.log('This tool will help you upload documents from a USB drive to Supabase.');
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

    // Detect USB drives
    console.log('\n🔍 Detecting USB drives...');
    const drives = await detectUSBDrives();
    
    if (drives.length === 0) {
      console.log('❌ No USB drives detected. Please connect a USB drive and try again.');
      process.exit(1);
    }

    console.log('📊 Detected drives:');
    drives.forEach((drive, index) => {
      console.log(`   ${index + 1}. ${drive.name} (${drive.path})`);
    });

    // Prompt user to select a drive
    const driveIndex = await promptForInput('Select a drive (number): ', (input) => {
      const num = parseInt(input);
      return !isNaN(num) && num >= 1 && num <= drives.length;
    }, 'Please enter a valid drive number.');

    const selectedDrive = drives[driveIndex - 1];
    console.log(`\n✅ Selected drive: ${selectedDrive.name} (${selectedDrive.path})`);

    // Prompt for subdirectory (optional)
    console.log('\n📂 Available directories:');
    const directories = getDirectories(selectedDrive.path);
    
    if (directories.length === 0) {
      console.log('   No subdirectories found, will use the root of the drive.');
    } else {
      directories.forEach((dir, index) => {
        console.log(`   ${index + 1}. ${dir}`);
      });
      console.log(`   ${directories.length + 1}. Use root directory`);
    }

    let sourcePath = selectedDrive.path;
    if (directories.length > 0) {
      const dirIndex = await promptForInput('Select a directory (number): ', (input) => {
        const num = parseInt(input);
        return !isNaN(num) && num >= 1 && num <= directories.length + 1;
      }, 'Please enter a valid directory number.');

      if (dirIndex <= directories.length) {
        sourcePath = path.join(selectedDrive.path, directories[dirIndex - 1]);
      }
    }

    console.log(`\n✅ Selected source path: ${sourcePath}`);

    // Prompt for metadata extraction method
    console.log('\n📋 Metadata extraction method:');
    console.log('   1. Extract from directory structure (e.g., Department/Category/Subject)');
    console.log('   2. Extract from filename pattern (e.g., Department_Category_Subject_v1.0.pdf)');
    console.log('   3. Use default values');

    const extractionMethod = await promptForInput('Select extraction method (number): ', (input) => {
      const num = parseInt(input);
      return !isNaN(num) && num >= 1 && num <= 3;
    }, 'Please enter a valid method number.');

    let metadataMethod = 'path';
    if (extractionMethod === 2) {
      metadataMethod = 'filename';
    } else if (extractionMethod === 3) {
      metadataMethod = 'default';
    }

    // Confirm and start upload
    console.log('\n🚀 Ready to start upload with the following settings:');
    console.log(`   Source: ${sourcePath}`);
    console.log(`   Destination: Supabase Storage (${CONFIG.STORAGE_BUCKET})`);
    console.log(`   Metadata extraction: ${metadataMethod}`);

    const confirm = await promptForInput('Start upload? (y/n): ', (input) => {
      return input.toLowerCase() === 'y' || input.toLowerCase() === 'n';
    }, 'Please enter y or n.');

    if (confirm.toLowerCase() === 'n') {
      console.log('❌ Upload cancelled.');
      process.exit(0);
    }

    // Start the bulk upload process
    console.log('\n🚀 Starting bulk upload process...');
    
    // Run the main bulk-upload.js script with the selected source path
    const bulkUploadProcess = spawn('node', [
      path.join(__dirname, 'bulk-upload.js'),
      sourcePath,
      `--metadata=${metadataMethod}`
    ], {
      stdio: 'inherit'
    });

    bulkUploadProcess.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Bulk upload completed successfully!');
      } else {
        console.error(`\n❌ Bulk upload failed with code ${code}`);
      }
      rl.close();
    });

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    rl.close();
    process.exit(1);
  }
}

// Helper function to prompt for user input with validation
function promptForInput(question, validator, errorMessage) {
  return new Promise((resolve) => {
    const ask = () => {
      rl.question(question, (answer) => {
        if (validator(answer)) {
          resolve(answer);
        } else {
          console.log(errorMessage);
          ask();
        }
      });
    };
    ask();
  });
}

// Helper function to detect USB drives
async function detectUSBDrives() {
  const drives = [];
  
  // Check common mount points based on OS
  if (process.platform === 'win32') {
    // Windows
    for (const letter of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
      const drivePath = `${letter}:\\`;
      try {
        if (fs.existsSync(drivePath)) {
          const stats = fs.statSync(drivePath);
          if (stats.isDirectory()) {
            drives.push({
              name: `Drive ${letter}:`,
              path: drivePath
            });
          }
        }
      } catch (error) {
        // Skip drives that can't be accessed
      }
    }
  } else if (process.platform === 'darwin') {
    // macOS
    const volumesPath = '/Volumes';
    if (fs.existsSync(volumesPath)) {
      const volumes = fs.readdirSync(volumesPath);
      for (const volume of volumes) {
        if (volume !== 'Macintosh HD') {
          const volumePath = path.join(volumesPath, volume);
          drives.push({
            name: volume,
            path: volumePath
          });
        }
      }
    }
  } else {
    // Linux
    const mediaPath = '/media';
    const userMediaPath = path.join(mediaPath, process.env.USER || '');
    
    if (fs.existsSync(userMediaPath)) {
      const mounts = fs.readdirSync(userMediaPath);
      for (const mount of mounts) {
        const mountPath = path.join(userMediaPath, mount);
        drives.push({
          name: mount,
          path: mountPath
        });
      }
    }
    
    // Also check /mnt
    const mntPath = '/mnt';
    if (fs.existsSync(mntPath)) {
      const mounts = fs.readdirSync(mntPath);
      for (const mount of mounts) {
        const mountPath = path.join(mntPath, mount);
        drives.push({
          name: mount,
          path: mountPath
        });
      }
    }
  }
  
  return drives;
}

// Helper function to get directories in a path
function getDirectories(sourcePath) {
  try {
    return fs.readdirSync(sourcePath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  } catch (error) {
    console.error(`Error reading directories: ${error.message}`);
    return [];
  }
}

// Start the script
main().catch(console.error);