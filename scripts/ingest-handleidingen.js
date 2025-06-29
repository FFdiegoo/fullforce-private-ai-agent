require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'company-docs';
const FOLDER = '120 Handleidingen';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function chunkText(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

async function extractText(filePath, ext) {
  if (ext === '.pdf') {
    const data = fs.readFileSync(filePath);
    const pdf = await pdfParse(data);
    return pdf.text;
  }
  if (ext === '.txt' || ext === '.md') {
    return fs.readFileSync(filePath, 'utf8');
  }
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  return '';
}

// Recursively list all files in a Supabase Storage folder
async function listAllFiles(folder, prefix = '') {
  let files = [];
  const { data, error } = await supabase.storage.from(BUCKET).list(folder + (prefix ? '/' + prefix : ''), { limit: 1000 });
  if (error) {
    console.error('❌ Kan bestanden niet ophalen:', error.message);
    return files;
  }
  for (const item of data) {
    if (item.name.endsWith('.keep')) continue;
    if (item.metadata && item.metadata.size === 0) continue; // skip lege bestanden
    if (item.id) continue; // skip folders
    if (item.name && item.name !== '') {
      if (item.metadata && item.metadata.mimetype === 'application/x-directory') {
        // submap, recursief ophalen
        const subFiles = await listAllFiles(folder, prefix ? `${prefix}/${item.name}` : item.name);
        files = files.concat(subFiles);
      } else {
        files.push(prefix ? `${prefix}/${item.name}` : item.name);
      }
    }
  }
  return files;
}

async function processFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.pdf', '.txt', '.md', '.docx'].includes(ext)) return;

  // Download file
  const { data, error } = await supabase.storage.from(BUCKET).download(`${FOLDER}/${filePath}`);
  if (error) {
    console.error(`❌ Fout bij downloaden: ${filePath}`, error.message);
    return;
  }
  const tempPath = path.join(__dirname, 'tmp', path.basename(filePath));
  fs.writeFileSync(tempPath, Buffer.from(await data.arrayBuffer()));

  // Extract text
  const text = await extractText(tempPath, ext);
  fs.unlinkSync(tempPath);
  if (!text || text.trim().length < 10) {
    console.warn(`⚠️ Geen bruikbare tekst in: ${filePath}`);
    return;
  }

  // Chunking
  const chunks = chunkText(text);

  // Embeddings & opslag
  for (const chunk of chunks) {
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: chunk
    });
    // Sla op in Supabase vector table
    await supabase.from('rag_chunks').insert({
      file_path: `${FOLDER}/${filePath}`,
      content: chunk,
      embedding: embedding.data[0].embedding
    });
  }
  console.log(`✅ Geïndexeerd: ${filePath}`);
}

async function main() {
  if (!fs.existsSync(path.join(__dirname, 'tmp'))) fs.mkdirSync(path.join(__dirname, 'tmp'));
  // Recursief alle bestanden ophalen
  const files = await listAllFiles(FOLDER);
  if (!files.length) {
    console.log('ℹ️ Geen documenten gevonden om te verwerken.');
    return;
  }
  for (const file of files) {
    await processFile(file);
    await new Promise(r => setTimeout(r, 500)); // Rate limit
  }
  console.log('🎉 Ingest klaar!');
}

main();