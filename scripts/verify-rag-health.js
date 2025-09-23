#!/usr/bin/env node

/**
 * RAG health verification
 *
 * Ensures the database schema and vector pipeline are aligned and operational.
 */

const { createClient } = require('@supabase/supabase-js');
const { EMBEDDING_DIMENSIONS, RAG_CONFIG } = require('../lib/rag/config');

require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const REQUIRED_METADATA_COLUMNS = [
  'processed',
  'processed_at',
  'needs_ocr',
  'chunk_count',
  'retry_count',
  'last_error',
  'storage_path',
  'mime_type',
  'filename',
  'ready_for_indexing',
  'last_updated',
];

const REQUIRED_CHUNK_COLUMNS = ['id', 'doc_id', 'chunk_index', 'content', 'embedding'];

async function fetchColumnMap() {
  const { data, error } = await supabase.rpc('sql', {
    query: `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('documents_metadata', 'document_chunks');
    `,
  });

  if (error) {
    throw new Error(`Failed to fetch column metadata: ${error.message}`);
  }

  const map = new Map();
  for (const row of data || []) {
    if (!map.has(row.table_name)) {
      map.set(row.table_name, new Set());
    }
    map.get(row.table_name).add(row.column_name);
  }
  return map;
}

async function fetchCount(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    throw new Error(`Failed to count ${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function fetchOrphanChunkCount() {
  const { data, error } = await supabase.rpc('sql', {
    query: `
      SELECT COUNT(*) AS count
      FROM public.document_chunks dc
      LEFT JOIN public.documents_metadata dm ON dm.id = dc.doc_id
      WHERE dm.id IS NULL;
    `,
  });
  if (error) {
    throw new Error(`Failed to count orphan chunks: ${error.message}`);
  }
  const raw = data?.[0]?.count ?? 0;
  return typeof raw === 'number' ? raw : Number.parseInt(raw, 10) || 0;
}

async function verifySchemaVisibility() {
  const { error } = await supabase.from('document_chunks').select('doc_id').limit(1);
  if (error) {
    throw new Error(`PostgREST schema cache still outdated: ${error.message}`);
  }
}

async function verifyMatchDocuments() {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: vector,
    similarity_threshold: RAG_CONFIG.similarityThreshold,
    match_count: Math.max(1, RAG_CONFIG.maxResults || 5),
  });
  if (error) {
    throw new Error(`match_documents RPC failed: ${error.message}`);
  }
  return Array.isArray(data) ? data.length : 0;
}

async function main() {
  const report = {
    metadataColumnsMissing: [],
    chunkColumnsMissing: [],
    documentsCount: 0,
    chunksCount: 0,
    orphanChunks: 0,
    schemaVisible: false,
    matchDocumentsResults: 0,
  };

  try {
    const columnMap = await fetchColumnMap();
    const metadataColumns = columnMap.get('documents_metadata') || new Set();
    const chunkColumns = columnMap.get('document_chunks') || new Set();

    report.metadataColumnsMissing = REQUIRED_METADATA_COLUMNS.filter((col) => !metadataColumns.has(col));
    report.chunkColumnsMissing = REQUIRED_CHUNK_COLUMNS.filter((col) => !chunkColumns.has(col));

    report.documentsCount = await fetchCount('documents_metadata');
    report.chunksCount = await fetchCount('document_chunks');
    report.orphanChunks = await fetchOrphanChunkCount();

    await verifySchemaVisibility();
    report.schemaVisible = true;

    report.matchDocumentsResults = await verifyMatchDocuments();
  } catch (error) {
    console.error('❌ RAG health verification failed:', error.message || error);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const issues = [];
  if (report.metadataColumnsMissing.length) {
    issues.push(`Missing metadata columns: ${report.metadataColumnsMissing.join(', ')}`);
  }
  if (report.chunkColumnsMissing.length) {
    issues.push(`Missing chunk columns: ${report.chunkColumnsMissing.join(', ')}`);
  }
  if (report.documentsCount <= 0) {
    issues.push('No documents found in documents_metadata.');
  }
  if (report.chunksCount <= 0) {
    issues.push('No chunks stored in document_chunks.');
  }
  if (report.orphanChunks > 0) {
    issues.push(`Found ${report.orphanChunks} orphan chunk(s).`);
  }
  if (!report.schemaVisible) {
    issues.push('document_chunks.doc_id not visible via PostgREST.');
  }

  if (issues.length) {
    console.error('❌ Issues detected:\n - ' + issues.join('\n - '));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  console.log('✅ RAG health looks good');
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unexpected error during health verification:', error.message || error);
    process.exit(1);
  });
}

module.exports = { main };
