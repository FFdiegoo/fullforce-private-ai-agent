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

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { RAGPipeline } = require('../lib/rag/pipeline');
const { RAG_CONFIG, openaiApiKey } = require('../lib/rag/config');
const { extractText } = require('../lib/rag/extract-text');
const { RetryableError, isRetryableError } = require('../lib/rag/errors');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const LIMIT = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : undefined;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOCUMENTS_BUCKET = process.env.SUPABASE_DOCUMENTS_BUCKET || RAG_CONFIG.documentsBucket;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials. Please check your .env.local file.');
  process.exit(1);
}

if (!DOCUMENTS_BUCKET) {
  console.error('❌ SUPABASE_DOCUMENTS_BUCKET environment variable is required.');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY);
const pipeline = new RAGPipeline(supabaseAdmin, openaiApiKey);

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

const summary = { ok: true, total: 0, processed_ok: 0, needs_ocr: 0, retried: 0, failed: 0 };

const IGNORED_FILENAMES = new Set(['thumbs.db']);
const UNSUPPORTED_EXTENSIONS = new Set(['.zip', '.nlbl']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPendingDocuments() {
  let query = supabaseAdmin
    .from('documents_metadata')
    .select('*')
    .eq('ready_for_indexing', true)
    .order('last_updated', { ascending: true });

  if (!FORCE) {
    query = query.eq('processed', false);
  }

  if (typeof LIMIT === 'number' && !Number.isNaN(LIMIT)) {
    query = query.limit(LIMIT);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }

  return data || [];
}

function shouldSkipDocument(document) {
  const filename = (document.filename || '').toLowerCase();
  if (IGNORED_FILENAMES.has(filename)) {
    return { skip: true, lastError: 'ignored-system-file', result: 'ignored-system-file' };
  }
  const ext = path.extname(filename);
  if (UNSUPPORTED_EXTENSIONS.has(ext)) {
    return { skip: true, lastError: 'unsupported-archive', result: 'unsupported-archive' };
  }
  return { skip: false };
}

function classifyError(error) {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status ?? error?.code;
  const retryable = Boolean(
    isRetryableError(error) ||
      status === 429 ||
      (typeof status === 'number' && status >= 500) ||
      (error?.message && /timeout/i.test(error.message))
  );

  const message = error?.message || (typeof error === 'string' ? error : 'unknown-error');
  return { retryable, status, message };
}

async function updateDocument(id, patch) {
  if (DRY_RUN) {
    console.log(`📝 [dry-run] would update document ${id}`, patch);
    return;
  }

  const update = { ...patch, last_updated: new Date().toISOString() };
  const { error } = await supabaseAdmin.from('documents_metadata').update(update).eq('id', id);
  if (error) {
    throw error;
  }
}

async function processDocument(document) {
  const logEntry = {
    id: document.id,
    filename: document.filename,
    mime: document.mime_type || null,
    kind: null,
    text_len: 0,
    chunks: 0,
    result: '',
    error: null,
    retry_count: document.retry_count || 0,
  };

  try {
    const skipInfo = shouldSkipDocument(document);
    if (skipInfo.skip) {
      await updateDocument(document.id, {
        processed: false,
        processed_at: null,
        needs_ocr: false,
        last_error: skipInfo.lastError,
        chunk_count: 0,
      });

      logEntry.result = skipInfo.result;
      logEntry.error = skipInfo.lastError;
      summary.failed += 1;
      return logEntry;
    }

    const bucket = document.bucket || DOCUMENTS_BUCKET;
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(bucket)
      .download(document.storage_path);

    if (downloadError) {
      const status = downloadError?.statusCode || downloadError?.status || 'unknown';
      const message = downloadError?.message || 'download-error';
      const lastError = `download-failed:${status}:${message}`;
      await updateDocument(document.id, {
        processed: false,
        processed_at: null,
        last_error: lastError,
      });

      logEntry.result = 'download-failed';
      logEntry.error = lastError;
      summary.failed += 1;
      return logEntry;
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const extracted = await extractText(buffer, document.filename);

    logEntry.kind = extracted.kind;
    logEntry.mime = extracted.mime || logEntry.mime;
    logEntry.text_len = extracted.text.length;

    if (extracted.text.length === 0) {
      const lastError = extracted.usedOcr ? 'ocr-failed' : 'needs-ocr';
      await updateDocument(document.id, {
        processed: false,
        processed_at: null,
        needs_ocr: true,
        last_error: lastError,
        chunk_count: 0,
      });

      logEntry.result = lastError;
      logEntry.error = lastError;
      summary.needs_ocr += 1;
      return logEntry;
    }

    const metadata = {
      ...document,
      bucket,
      mime_type: extracted.mime || document.mime_type,
      extractedText: extracted.text,
    };

    const chunkCount = await runPipelineWithRetries(metadata, logEntry);
    logEntry.chunks = chunkCount;

    await updateDocument(document.id, {
      processed: true,
      processed_at: new Date().toISOString(),
      needs_ocr: false,
      last_error: null,
      chunk_count: chunkCount,
      retry_count: 0,
      mime_type: metadata.mime_type,
      bucket,
    });

    logEntry.result = 'processed';
    summary.processed_ok += 1;
    return logEntry;
  } catch (error) {
    const { message } = classifyError(error);
    await updateDocument(document.id, {
      processed: false,
      processed_at: null,
      last_error: message,
    });

    logEntry.result = 'failed';
    logEntry.error = message;
    summary.failed += 1;
    return logEntry;
  }
}

async function runPipelineWithRetries(metadata, logEntry) {
  let attempt = 0;
  let retryCount = logEntry.retry_count || 0;
  let countedRetry = false;
  const maxRetries = RAG_CONFIG.retryMax;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      const chunkCount = await pipeline.processDocument(
        metadata,
        {
          chunkSize: RAG_CONFIG.chunkSize,
          chunkOverlap: RAG_CONFIG.chunkOverlap,
          dryRun: DRY_RUN,
        },
        { dryRun: DRY_RUN }
      );
      return chunkCount;
    } catch (error) {
      const { retryable, message } = classifyError(error);
      lastError = message;

      if (!retryable || attempt >= maxRetries) {
        if (retryable && attempt >= maxRetries) {
          await updateDocument(metadata.id, {
            processed: false,
            processed_at: null,
            last_error: 'retry-exhausted',
          });
          logEntry.error = 'retry-exhausted';
          throw new RetryableError('retry-exhausted', error);
        }
        throw error;
      }

      attempt += 1;
      retryCount += 1;
      logEntry.retry_count = retryCount;
      if (!countedRetry) {
        summary.retried += 1;
        countedRetry = true;
      }

      await updateDocument(metadata.id, {
        processed: false,
        processed_at: null,
        last_error: message,
        retry_count: retryCount,
      });

      const delay = Math.min(60000, Math.pow(2, attempt) * 1000);
      await sleep(delay);
    }
  }

  throw new RetryableError(lastError || 'retry-exhausted');
}

async function processDocuments(documents) {
  const concurrency = Math.max(1, RAG_CONFIG.concurrency || 2);
  const delayMs = Math.max(0, RAG_CONFIG.delayMs || 0);
  const executing = new Set();

  for (const document of documents) {
    const task = (async () => {
      const result = await processDocument(document);
      console.log(JSON.stringify(result));
    })().finally(() => executing.delete(task));

    executing.add(task);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  await Promise.all(executing);
}

async function main() {
  try {
    const documents = await fetchPendingDocuments();
    if (!documents.length) {
      console.log(JSON.stringify(summary));
      return summary;
    }

    summary.total = documents.length;
    await processDocuments(documents);

    console.log(JSON.stringify(summary));
    return summary;
  } catch (error) {
    console.error('❌ Fatal error:', error?.message || error);
    summary.ok = false;
    console.log(JSON.stringify(summary));
    process.exitCode = 1;
    return summary;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = {
  main,
  shouldSkipDocument,
  classifyError,
  processDocument,
  runPipelineWithRetries,
};
