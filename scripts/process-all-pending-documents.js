#!/usr/bin/env node

// ---- fetch polyfill (voor Node < 18; onschadelijk op >=18) ----
let _undici;
try { _undici = require('undici'); } catch {}
if (_undici) {
  const { fetch, Headers, Request, Response } = _undici;
  Object.assign(global, { fetch, Headers, Request, Response });
} else {
  try {
    const fetch = require('node-fetch');
    global.fetch = fetch;
  } catch {}
}

// ---- ts-node CJS hook + env laden ----
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
require('dotenv').config({ path: '.env.local' });

// ---- imports ----
const { createClient } = require('@supabase/supabase-js');

// ✅ Let op de .ts extensies hieronder (je roept aan vanuit een .js script)
const { RAGPipeline } = require('../lib/rag/pipeline.ts');
const { RAG_CONFIG, openaiApiKey } = require('../lib/rag/config.ts');
const { extractText } = require('../lib/rag/extract-text.ts');

// ---- config ----
const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  BATCH_SIZE: 10,
  CONCURRENCY: 3,
  DELAY_MS: 2000,
};

if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials. Please check your .env.local file.');
  process.exit(1);
}

const supabaseAdmin = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
const pipeline = new RAGPipeline(supabaseAdmin, openaiApiKey);

async function withTimeout(promise, ms = 60_000) {
  return await Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);
}

const summary = { total: 0, processed_ok: 0, needs_ocr: 0, retried: 0, failed: 0 };

async function main() {
  try {
    const { data: documents, error } = await supabaseAdmin
      .from('documents_metadata')
      .select('*')
      .eq('ready_for_indexing', true)
      .eq('processed', false)
      .order('last_updated', { ascending: true });

    if (error) throw new Error(`Failed to fetch documents: ${error.message}`);

    if (!documents || documents.length === 0) {
      console.log('✅ No documents to process');
      console.log(JSON.stringify({ ok: true, total: 0, processed_ok: 0, needs_ocr: 0, retried: 0, failed: 0 }));
      return;
    }

    summary.total = documents.length;
    const batches = chunkArray(documents, CONFIG.BATCH_SIZE);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`\n🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} docs)`);
      await processBatch(batch, CONFIG.CONCURRENCY);
      if (i < batches.length - 1) await delay(CONFIG.DELAY_MS);
    }

    console.log(JSON.stringify({ ok: true, ...summary }));
  } catch (err) {
    console.error('❌ Fatal error:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function processBatch(docs, concurrency) {
  const executing = [];
  for (const doc of docs) {
    const p = processDocument(doc).finally(() => {
      const idx = executing.indexOf(p);
      if (idx > -1) executing.splice(idx, 1);
    });
    executing.push(p);
    if (executing.length >= concurrency) await Promise.race(executing);
  }
  await Promise.all(executing);
}

async function processDocument(document) {
  try {
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('company-docs') // bucket
      .download(document.storage_path);
    if (downloadError) throw new Error(`Failed to download: ${downloadError.message}`);

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const { kind, mime, text } = await extractText(buffer, document.filename);
    const textLen = (text || '').trim().length;
    if (kind === 'pdf-scan' || kind === 'unknown' || textLen === 0) {
      const reason = kind === 'unknown' ? 'unknown-mime' : 'needs-ocr-scan';
      await supabaseAdmin
        .from('documents_metadata')
        .update({ processed: false, processed_at: null, needs_ocr: true, chunk_count: 0, last_error: reason })
        .eq('id', document.id);
      summary.needs_ocr++;
      console.log(`[${document.id}] ${document.filename} | ${mime} | kind=${kind} | text_len=${textLen} | result=${reason}`);
      return;
    }

    const extractedText = text;
    let chunkCount = 0;
    try {
      const metadata = { ...document, extractedText };
      chunkCount = await withTimeout(
        pipeline.processDocument(metadata, {
          chunkSize: RAG_CONFIG.chunkSize,
          chunkOverlap: RAG_CONFIG.chunkOverlap,
          skipExisting: false,
        })
      );

      await supabaseAdmin
        .from('documents_metadata')
        .update({ processed: true, processed_at: new Date().toISOString(), chunk_count: chunkCount, last_error: null })
        .eq('id', document.id);

      summary.processed_ok++;
      console.log(`[${document.id}] ${document.filename} | ${mime} | kind=${kind} | text_len=${textLen} | chunks=${chunkCount}`);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const isOpenAIError = (err && err.name && String(err.name).includes('OpenAI')) || err?.status === 429;

      const update = isOpenAIError
        ? { last_error: `Processing failed: ${msg}`, retry_count: (document.retry_count || 0) + 1 }
        : { processed: true, processed_at: new Date().toISOString(), last_error: `Processing failed: ${msg}`, chunk_count: 0 };

      await supabaseAdmin.from('documents_metadata').update(update).eq('id', document.id);

      if (isOpenAIError) {
        summary.retried++;
        console.log(`[${document.id}] ${document.filename} | ${mime} | kind=${kind} | text_len=${textLen} | result=retry`);
      } else {
        summary.failed++;
        console.log(`[${document.id}] ${document.filename} | ${mime} | kind=${kind} | text_len=${textLen} | result=fail`);
      }
    }
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    summary.failed++;
    console.log(`[${document.id}] ${document.filename} | result=fatal-${msg}`);
  }
}

main();
