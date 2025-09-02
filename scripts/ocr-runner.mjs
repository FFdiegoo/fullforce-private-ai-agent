#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing Supabase envs'); process.exit(1);
}
const argv = process.argv.slice(2);
const limitArg = Number((argv.find(a => a.startsWith('--limit='))||'').split('=')[1]||'1');
const LIMIT = Math.min(Math.max(isFinite(limitArg)?limitArg:1,1),5);
const BUCKET = 'company-docs';
const TMP = '/tmp';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function runDockerOCR(inFile, outFile) {
  const args = [
    'run','--rm',
    '-v', `${TMP}:/work`,
    'ghcr.io/ocrmypdf/ocrmypdf:latest',
    path.basename(inFile),
    path.basename(outFile),
    '--skip-text','--force-ocr','--rotate-pages','--clean','--deskew','--optimize','2'
  ];
  const r = spawnSync('docker', args, { cwd: TMP, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ocrmypdf failed with code ${r.status}`);
}

async function main() {
  console.log(`🔍 Fetching up to ${LIMIT} needs_ocr docs...`);
  const { data: docs, error } = await supabase
    .from('documents_metadata')
    .select('id, filename, storage_path')
    .eq('needs_ocr', true)
    .eq('processed', false)
    .order('last_updated', { ascending: true })
    .limit(LIMIT);
  if (error) throw error;
  if (!docs?.length) { console.log('✅ No OCR docs'); return; }

  for (const d of docs) {
    console.log(`📥 Download ${d.filename} (${d.id})`);
    const { data: fileData, error: dlErr } = await supabase.storage.from(BUCKET).download(d.storage_path);
    if (dlErr) { console.error('❌ download failed', dlErr.message); continue; }
    const inFile = path.join(TMP, `${d.id}.pdf`);
    const outFile = path.join(TMP, `${d.id}.ocr.pdf`);
    const buf = Buffer.from(await fileData.arrayBuffer());
    fs.writeFileSync(inFile, buf);
    console.log(`🔠 OCR... (${buf.length} bytes)`);
    runDockerOCR(inFile, outFile);
    const outBuf = fs.readFileSync(outFile);
    console.log(`📤 Upload OCR (${outBuf.length} bytes)`);
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(d.storage_path, outBuf, { contentType: 'application/pdf', upsert: true });
    if (upErr) { console.error('❌ upload failed', upErr.message); continue; }
    await supabase.from('documents_metadata').update({
      needs_ocr: false,
      last_error: null,
      // laat processed=false zodat je bestaande cron 'm oppakt
    }).eq('id', d.id);
    console.log(`✅ OCR done for ${d.filename}`);
  }
}
main().catch(e => { console.error('❌', e); process.exit(1); });

