import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { RAGPipeline } from '../../../lib/rag/pipeline';
import { openaiApiKey, RAG_CONFIG } from '../../../lib/rag/config';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// ✅ Environment vars
const API_KEY = process.env.CRON_API_KEY || 'default-key';
const CRON_BYPASS_KEY = process.env.CRON_BYPASS_KEY || 'fallback-key';

function validateAndNormalizePath(storagePath: string): string {
  if (!storagePath || storagePath.trim() === '') throw new Error('Invalid storage path');
  return storagePath.startsWith('/') ? storagePath.substring(1) : storagePath;
}

async function downloadWithRetry(supabaseAdmin: any, path: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📥 Attempt ${attempt}: downloading ${path}`);
      const { data, error } = await supabaseAdmin.storage.from('company-docs').download(path);

      if (error) {
        const msg = error.message || error.error || JSON.stringify(error);
        if (attempt === maxRetries) throw new Error(`Download failed: ${msg}`);
        console.warn(`⚠️ Download error [${attempt}]: ${msg}`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }

      if (!data) throw new Error('Supabase returned null fileData');
      return data;
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      console.warn(`⚠️ Retry download exception [${attempt}]: ${err.message}`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = req.headers['x-api-key'] || req.query.key;
  const cronKey = req.headers['x-cron-key'] || req.headers['X-Cron-Key'];

  if (apiKey === API_KEY) {
    console.log('✅ API key OK');
  } else if (cronKey && cronKey === CRON_BYPASS_KEY) {
    console.log('✅ CRON bypass key OK');
  } else {
    console.warn('❌ Unauthorized access attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const limit = parseInt(req.query.limit as string) || 10;

    // 🧠 Fetch unprocessed documents
    const { data: documents, error: fetchError } = await supabase
      .from('documents_metadata')
      .select('*')
      .eq('ready_for_indexing', true)
      .eq('processed', false)
      .order('last_updated', { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error('❌ Failed to fetch documents:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    if (!documents?.length) {
      console.log('✅ No documents to process');
      return res.status(200).json({ message: 'No documents to process' });
    }

    const results = [];

    for (const doc of documents) {
      try {
        console.log(`📄 Processing: ${doc.filename} (${doc.storage_path})`);

        const normalizedPath = validateAndNormalizePath(doc.storage_path);
        const fileData = await downloadWithRetry(supabaseAdmin, normalizedPath);

        let extractedText = '';
        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (doc.mime_type === 'application/pdf' || doc.filename.endsWith('.pdf')) {
          const parsed = await pdfParse(buffer);
          extractedText = parsed.text;
        } else if (
          doc.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          doc.filename.endsWith('.docx')
        ) {
          const parsed = await mammoth.extractRawText({ buffer });
          extractedText = parsed.value;
        } else if (doc.mime_type === 'text/plain' || doc.filename.endsWith('.txt')) {
          extractedText = await fileData.text();
        } else {
          try {
            extractedText = await fileData.text();
          } catch {
            throw new Error(`Unsupported file format: ${doc.mime_type}`);
          }
        }

        if (!extractedText.trim()) throw new Error('Empty text after extraction');

        doc.extractedText = extractedText;

        const pipeline = new RAGPipeline(supabase, openaiApiKey);
        await pipeline.processDocument(doc, {
          chunkSize: RAG_CONFIG.chunkSize,
          chunkOverlap: RAG_CONFIG.chunkOverlap,
          skipExisting: false,
        });

        const { count: chunkCount, error: countError } = await supabase
          .from('document_chunks')
          .select('*', { count: 'exact', head: true })
          .eq('metadata->id', doc.id);

        if (countError) console.warn('⚠️ Chunk count error:', countError.message);

        await supabaseAdmin
          .from('documents_metadata')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            chunk_count: chunkCount || 0,
            last_error: null,
          })
          .eq('id', doc.id);

        console.log(`✅ Processed ${doc.filename} → ${chunkCount || 0} chunks`);
        results.push({ id: doc.id, filename: doc.filename, success: true, chunkCount: chunkCount || 0 });
      } catch (err: any) {
        console.error(`❌ Failed to process ${doc.filename}: ${err.message}`);
        await supabaseAdmin
          .from('documents_metadata')
          .update({
            processed_at: new Date().toISOString(),
            last_error: err.message,
          })
          .eq('id', doc.id);

        results.push({ id: doc.id, filename: doc.filename, success: false, error: err.message });
      }
    }

    const success = results.filter(r => r.success).length;
    const failed = results.length - success;

    return res.status(200).json({
      message: `Processed ${results.length} documents`,
      processed: success,
      failed,
      results,
    });

  } catch (err: any) {
    console.error('💥 CRON job failed:', err.message);
    return res.status(500).json({ error: 'Unexpected error', details: err.message });
  }
}
