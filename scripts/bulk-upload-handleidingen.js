const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuratie
const BATCH_SIZE = 50; // Aantal bestanden per batch
const MAX_CONCURRENT = 4; // Aantal parallelle uploads
const EXCLUDED_FOLDERS = ['MISC']; // Uitgesloten mappen
const TEST_FOLDER = 'handleidingen'; // Test map voor eerste run

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Ondersteunde bestandstypen
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.md'];
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB default

class BulkUploader {
  constructor(sourcePath, testMode = false) {
    this.sourcePath = sourcePath;
    this.testMode = testMode;
    this.stats = {
      total: 0,
      uploaded: 0,
      failed: 0,
      skipped: 0,
      startTime: Date.now()
    };
    this.failedFiles = [];
  }

  // Scan bestanden in de opgegeven map
  async scanFiles(dirPath, targetFolder = null) {
    const files = [];

    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);

        if (item.isDirectory()) {
          // Skip uitgesloten mappen
          if (EXCLUDED_FOLDERS.includes(item.name)) {
            console.log(`⏭️  Skipping excluded folder: ${item.name}`);
            continue;
          }

          // In test mode, alleen de test folder verwerken
          if (this.testMode && targetFolder && item.name !== targetFolder) {
            console.log(`⏭️  Skipping folder in test mode: ${item.name}`);
            continue;
          }

          // Recursief scannen van submappen
          const subFiles = await this.scanFiles(fullPath, targetFolder);
          files.push(...subFiles);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();

          // Check bestandstype
          if (!ALLOWED_EXTENSIONS.includes(ext)) {
            console.log(`⏭️  Skipping unsupported file type: ${item.name}`);
            this.stats.skipped++;
            continue;
          }

          // Check bestandsgrootte
          const stats = fs.statSync(fullPath);
          if (stats.size > MAX_FILE_SIZE) {
            console.log(`⏭️  Skipping large file (${Math.round(stats.size/1024/1024)}MB): ${item.name}`);
            this.stats.skipped++;
            continue;
          }

          files.push({
            fullPath,
            fileName: item.name,
            size: stats.size,
            relativePath: path.relative(this.sourcePath, fullPath),
            category: this.extractCategory(fullPath),
            mimeType: this.getMimeType(ext)
          });
        }
      }
    } catch (error) {
      console.error(`❌ Error scanning directory ${dirPath}:`, error.message);
    }

    return files;
  }

  // Extraheer categorie uit bestandspad
  extractCategory(filePath) {
    const relativePath = path.relative(this.sourcePath, filePath);
    const pathParts = relativePath.split(path.sep);

    // Eerste map is de hoofdcategorie
    const mainCategory = pathParts[0] || 'uncategorized';

    // Tweede map is subcategorie (indien aanwezig)
    const subCategory = pathParts.length > 2 ? pathParts[1] : null;

    return {
      main: mainCategory,
      sub: subCategory,
      full: pathParts.slice(0, -1).join(' > ') || 'root'
    };
  }

  // Bepaal MIME type
  getMimeType(extension) {
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.md': 'text/markdown'
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  // Upload een enkel bestand
  async uploadFile(fileInfo) {
    try {
      // Genereer veilige bestandsnaam
      const timestamp = Date.now();
      const safeFileName = `${timestamp}_${fileInfo.fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const storagePath = `company-docs/${fileInfo.category.main}/${safeFileName}`;

      // Lees bestand
      const fileBuffer = fs.readFileSync(fileInfo.fullPath);

      // Upload naar Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('company-docs')
        .upload(`${fileInfo.category.main}/${safeFileName}`, fileBuffer, {
          contentType: fileInfo.mimeType,
          duplex: 'half'
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      // Sla metadata op in database
      const { data: metadataData, error: metadataError } = await supabase
        .from('documents_metadata')
        .insert({
          filename: fileInfo.fileName,
          safe_filename: safeFileName,
          storage_path: storagePath,
          file_size: fileInfo.size,
          mime_type: fileInfo.mimeType,
          category: fileInfo.category.main,
          metadata: {
            subcategory: fileInfo.category.sub,
            full_path: fileInfo.category.full,
            original_path: fileInfo.relativePath,
            upload_timestamp: new Date().toISOString()
          },
          ready_for_indexing: true,
          processed: false
        })
        .select()
        .single();

      if (metadataError) {
        // Probeer het geüploade bestand te verwijderen bij database fout
        await supabase.storage
          .from('company-docs')
          .remove([`${fileInfo.category.main}/${safeFileName}`]);

        throw new Error(`Database insert failed: ${metadataError.message}`);
      }

      console.log(`✅ Uploaded: ${fileInfo.fileName} (${Math.round(fileInfo.size/1024)}KB) [ID: ${metadataData.id}]`);
      this.stats.uploaded++;

      return { success: true, id: metadataData.id };

    } catch (error) {
      console.error(`❌ Failed to upload ${fileInfo.fileName}:`, error.message);
      this.failedFiles.push({
        file: fileInfo.fileName,
        path: fileInfo.fullPath,
        error: error.message
      });
      this.stats.failed++;

      return { success: false, error: error.message };
    }
  }

  // Upload bestanden in batches
  async uploadBatch(files) {
    const promises = files.map(file => this.uploadFile(file));
    return await Promise.allSettled(promises);
  }

  // Hoofdfunctie voor bulk upload
  async start() {
    console.log('🚀 Starting Bulk Upload to Supabase...');
    console.log(`📁 Source: ${this.sourcePath}`);
    console.log(`🧪 Test Mode: ${this.testMode ? 'ON (handleidingen only)' : 'OFF'}`);
    console.log(`🚫 Excluded folders: ${EXCLUDED_FOLDERS.join(', ')}`);
    console.log('');

    // Test Supabase verbinding
    console.log('🔗 Testing Supabase connection...');
    try {
      const { data, error } = await supabase.from('documents_metadata').select('count').limit(1);
      if (error) throw error;
      console.log('✅ Supabase connection verified');
    } catch (error) {
      console.error('❌ Supabase connection failed:', error.message);
      return;
    }

    // Scan bestanden
    console.log('📂 Scanning files...');
    const targetFolder = this.testMode ? TEST_FOLDER : null;
    const files = await this.scanFiles(this.sourcePath, targetFolder);

    if (files.length === 0) {
      console.log('❌ No files found to upload');
      return;
    }

    this.stats.total = files.length;
    console.log(`📊 Found ${files.length} files to upload`);

    // Toon categorie overzicht
    const categories = {};
    files.forEach(file => {
      categories[file.category.main] = (categories[file.category.main] || 0) + 1;
    });

    console.log('📋 Categories found:');
    Object.entries(categories).forEach(([cat, count]) => {
      console.log(`   - ${cat}: ${count} files`);
    });
    console.log('');

    // Bevestiging vragen
    if (this.testMode) {
      console.log('🧪 TEST MODE: Only uploading "handleidingen" folder');
    }

    // Upload in batches
    console.log('📤 Starting upload...');
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(files.length / BATCH_SIZE);

      console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} files)`);

      await this.uploadBatch(batch);

      // Voortgang tonen
      const progress = Math.round((this.stats.uploaded + this.stats.failed) / this.stats.total * 100);
      console.log(`📊 Progress: ${progress}% (${this.stats.uploaded} uploaded, ${this.stats.failed} failed)`);
    }

    // Eindrapport
    this.generateReport();
  }

  // Genereer eindrapport
  generateReport() {
    const duration = Math.round((Date.now() - this.stats.startTime) / 1000);

    console.log('\n' + '='.repeat(50));
    console.log('📋 BULK UPLOAD REPORT');
    console.log('='.repeat(50));
    console.log(`📁 Source: ${this.sourcePath}`);
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`📊 Total files: ${this.stats.total}`);
    console.log(`✅ Successfully uploaded: ${this.stats.uploaded}`);
    console.log(`❌ Failed uploads: ${this.stats.failed}`);
    console.log(`⏭️  Skipped files: ${this.stats.skipped}`);

    if (this.failedFiles.length > 0) {
      console.log('\n❌ Failed Files:');
      this.failedFiles.forEach(fail => {
        console.log(`   - ${fail.file}: ${fail.error}`);
      });
    }

    // Sla rapport op
    const report = {
      timestamp: new Date().toISOString(),
      source: this.sourcePath,
      testMode: this.testMode,
      duration,
      stats: this.stats,
      failedFiles: this.failedFiles
    };

    const reportPath = path.join(process.cwd(), 'bulk-upload-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📊 Report saved to: ${reportPath}`);

    console.log('\n🎯 Next Steps:');
    console.log('1. Check Supabase Storage bucket for uploaded files');
    console.log('2. Verify documents_metadata table entries');
    console.log('3. Run RAG processing on uploaded documents');
    if (this.testMode) {
      console.log('4. If test successful, run full upload without test mode');
    }
  }
}

// Hoofdfunctie
async function main() {
  // Check argumenten
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node scripts/bulk-upload-handleidingen.js <source-path>');
    console.log('Example: node scripts/bulk-upload-handleidingen.js /path/to/usb/drive');
    process.exit(1);
  }

  const sourcePath = args[0];

  // Check of pad bestaat
  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ Source path does not exist: ${sourcePath}`);
    process.exit(1);
  }

  // Check of handleidingen map bestaat
  const handleidingenPath = path.join(sourcePath, 'handleidingen');
  if (!fs.existsSync(handleidingenPath)) {
    console.error(`❌ "handleidingen" folder not found in: ${sourcePath}`);
    console.log('Available folders:');
    const folders = fs.readdirSync(sourcePath, { withFileTypes: true })
      .filter(item => item.isDirectory())
      .map(item => item.name);
    folders.forEach(folder => console.log(`   - ${folder}`));
    process.exit(1);
  }

  // Start upload (in test mode)
  const uploader = new BulkUploader(sourcePath, true);
  await uploader.start();
}

// Start script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

module.exports = BulkUploader;
