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
  // Upload een leeg .keep bestand om de map zichtbaar te maken
  const { error } = await supabase
    .storage
    .from(BUCKET)
    .upload(`${relPath}/.keep`, Buffer.from(''), { upsert: true });
  if (error && !error.message.includes('The resource already exists')) {
    console.error(`Fout bij uploaden van ${relPath}/.keep:`, error.message);
  } else {
    console.log(`Map aangemaakt: ${relPath}/`);
  }
}

function walkDirs(dir, baseDir, callback) {
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
}

async function main() {
  if (!fs.existsSync(ROOT_DIR)) {
    console.error('Root directory bestaat niet:', ROOT_DIR);
    process.exit(1);
  }
  const allFolders = [];
  walkDirs(ROOT_DIR, ROOT_DIR, (relPath) => {
    if (relPath) allFolders.push(relPath);
  });

  for (const relPath of allFolders) {
    await uploadKeepFile(relPath);
  }
  console.log('\n✅ Alle mappenstructuren zijn gespiegeld naar Supabase!');
}

main().catch(console.error);