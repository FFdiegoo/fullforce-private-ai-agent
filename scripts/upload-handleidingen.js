const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// === CONFIG ===
const SUPABASE_URL = 'https://xcrsfcwdjxsbmmrqnose.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcnNmY3dkanhzYm1tcnFub3NlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjUzNjc1OCwiZXhwIjoyMDYyMTEyNzU4fQ.BxHofBt6ViKx4FbV7218Ad2GAekhZQXEd6CiHkkjOGI';
const BUCKET = 'company-docs';
const SOURCE_DIR = 'D:/120 Handleidingen'; // Specifiek de handleidingen map
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.md', '.xlsx', '.xls'];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Statistieken
let stats = {
  totalFiles: 0,
  uploaded: 0,
  skipped: 0,
  errors: 0,
  skippedReasons: {}
};

function isAllowedFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const size = fs.statSync(filePath).size;
  
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    stats.skippedReasons[`Unsupported extension: ${ext}`] = (stats.skippedReasons[`Unsupported extension: ${ext}`] || 0) + 1;
    return false;
  }
  
  if (size > MAX_FILE_SIZE) {
    stats.skippedReasons[`File too large: ${(size / 1024 / 1024).toFixed(1)}MB`] = (stats.skippedReasons[`File too large: ${(size / 1024 / 1024).toFixed(1)}MB`] || 0) + 1;
    return false;
  }
  
  return true;
}

async function uploadFile(filePath, relPath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const supabasePath = `120 Handleidingen/${relPath}`;
    
    console.log(`📤 Uploading: ${supabasePath}`);
    
    const { error, data } = await supabase
      .storage
      .from(BUCKET)
      .upload(supabasePath, fileBuffer, { 
        upsert: true,
        contentType: getContentType(filePath)
      });
    
    if (error) {
      console.error(`❌ Fout bij uploaden van ${fileName}:`, error.message);
      stats.errors++;
      return false;
    } else {
      console.log(`✅ Geüpload: ${fileName}`);
      stats.uploaded++;
      return true;
    }
  } catch (err) {
    console.error(`❌ Onverwachte fout bij ${filePath}:`, err.message);
    stats.errors++;
    return false;
  }
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel'
  };
  return contentTypes[ext] || 'application/octet-stream';
}

function walkFiles(dir, baseDir, callback) {
  try {
    const skipFolders = ['$RECYCLE.BIN', 'System Volume Information', 'Recovery'];
    
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (skipFolders.includes(entry.name)) return;
        walkFiles(fullPath, baseDir, callback);
      } else if (entry.isFile()) {
        const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        callback(fullPath, relPath);
      }
    });
  } catch (err) {
    console.error(`❌ Kan map niet lezen: ${dir}`, err.message);
  }
}

async function generateReport() {
  const reportData = {
    timestamp: new Date().toISOString(),
    source: SOURCE_DIR,
    bucket: BUCKET,
    statistics: stats,
    skipped_reasons: stats.skippedReasons
  };
  
  const reportPath = path.join(process.cwd(), 'handleidingen-upload-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`📊 Rapport opgeslagen: ${reportPath}`);
}

async function main() {
  console.log('🚀 Starten met uploaden van handleidingen naar Supabase...');
  console.log(`📂 Bron: ${SOURCE_DIR}`);
  console.log(`🪣 Bucket: ${BUCKET}`);
  console.log(`📏 Max bestandsgrootte: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  console.log(`📋 Toegestane extensies: ${ALLOWED_EXTENSIONS.join(', ')}`);
  console.log('');

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error('❌ Handleidingen directory bestaat niet:', SOURCE_DIR);
    process.exit(1);
  }

  // Verzamel alle bestanden
  const allFiles = [];
  walkFiles(SOURCE_DIR, SOURCE_DIR, (fullPath, relPath) => {
    stats.totalFiles++;
    if (isAllowedFile(fullPath)) {
      allFiles.push({ fullPath, relPath });
    } else {
      stats.skipped++;
    }
  });

  console.log(`📊 Gevonden bestanden: ${stats.totalFiles}`);
  console.log(`📤 Te uploaden: ${allFiles.length}`);
  console.log(`⏭️  Overgeslagen: ${stats.skipped}`);
  console.log('');

  // Upload bestanden met vertraging
  for (let i = 0; i < allFiles.length; i++) {
    const { fullPath, relPath } = allFiles[i];
    console.log(`[${i + 1}/${allFiles.length}] Processing: ${path.basename(fullPath)}`);
    
    await uploadFile(fullPath, relPath);
    
    // Vertraging van 500ms tussen uploads voor rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('');
  console.log('🎉 Upload voltooid!');
  console.log(`✅ Succesvol geüpload: ${stats.uploaded} bestanden`);
  console.log(`❌ Fouten: ${stats.errors} bestanden`);
  console.log(`⏭️  Overgeslagen: ${stats.skipped} bestanden`);
  
  if (Object.keys(stats.skippedReasons).length > 0) {
    console.log('\n📋 Redenen voor overslaan:');
    Object.entries(stats.skippedReasons).forEach(([reason, count]) => {
      console.log(`   ${reason}: ${count} bestanden`);
    });
  }

  await generateReport();
  console.log('\n🏁 Klaar!');
}

main().catch((err) => {
  console.error('❌ Script gefaald:', err.message);
  process.exit(1);
});