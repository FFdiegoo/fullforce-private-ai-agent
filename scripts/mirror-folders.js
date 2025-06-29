const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// === CONFIG ===
const SUPABASE_URL = 'https://xcrsfcwdjxsbmmrqnose.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcnNmY3dkanhzYm1tcnFub3NlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjUzNjc1OCwiZXhwIjoyMDYyMTEyNzU4fQ.BxHofBt6ViKx4FbV7218Ad2GAekhZQXEd6CiHkkjOGI';
const BUCKET = 'company-docs';
const ROOT_DIR = 'D:/'; // <-- Hier staat al je data in de mappen

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function uploadKeepFile(relPath) {
  try {
    // Upload een leeg .keep bestand om de map zichtbaar te maken
    const { error, data } = await supabase
      .storage
      .from(BUCKET)
      .upload(`${relPath}/.keep`, Buffer.from(''), { upsert: true });
    
    if (error && !error.message.includes('The resource already exists')) {
      console.error(`❌ Fout bij uploaden van ${relPath}/.keep:`, error.message);
      return false;
    } else {
      console.log(`✅ Map aangemaakt: ${relPath}/`);
      return true;
    }
  } catch (err) {
    console.error(`❌ Onverwachte fout bij ${relPath}:`, err.message);
    return false;
  }
}

function walkDirs(dir, baseDir, callback) {
  try {
    // Sla systeemmappen over
    const skipFolders = ['$RECYCLE.BIN', 'System Volume Information', 'Recovery', 'Config.Msi', 'ProgramData', 'Windows'];
    
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      if (entry.isDirectory()) {
        if (skipFolders.includes(entry.name)) return; // skip deze map
        
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        callback(relPath);
        walkDirs(fullPath, baseDir, callback);
      }
    });
  } catch (err) {
    console.error(`❌ Kan map niet lezen: ${dir}`, err.message);
  }
}

async function main() {
  console.log('🚀 Starten met spiegelen van mappenstructuur naar Supabase...');
  console.log(`📂 Bron: ${ROOT_DIR}`);
  console.log(`🪣 Bucket: ${BUCKET}`);
  console.log('');

  if (!fs.existsSync(ROOT_DIR)) {
    console.error('❌ Root directory bestaat niet:', ROOT_DIR);
    process.exit(1);
  }

  // Verzamel alle mappen
  const allFolders = [];
  walkDirs(ROOT_DIR, ROOT_DIR, (relPath) => {
    if (relPath) allFolders.push(relPath);
  });

  console.log(`📊 Gevonden mappen: ${allFolders.length}`);
  console.log('');

  // Upload met vertraging
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < allFolders.length; i++) {
    const relPath = allFolders[i];
    console.log(`[${i + 1}/${allFolders.length}] Uploading: ${relPath}`);
    
    const success = await uploadKeepFile(relPath);
    if (success) {
      successCount++;
    } else {
      errorCount++;
    }
    
    // Vertraging van 300ms tussen uploads om rate limits te voorkomen
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('');
  console.log('🎉 Klaar!');
  console.log(`✅ Succesvol: ${successCount} mappen`);
  console.log(`❌ Fouten: ${errorCount} mappen`);
  console.log('');
  console.log('📋 Alle mappenstructuren zijn gespiegeld naar Supabase!');
}

main().catch((err) => {
  console.error('❌ Script gefaald:', err.message);
  process.exit(1);
});