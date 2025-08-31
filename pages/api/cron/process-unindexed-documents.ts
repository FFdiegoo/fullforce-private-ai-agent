import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { RAGPipeline } from '../../../lib/rag/pipeline';
import { openaiApiKey, RAG_CONFIG } from '../../../lib/rag/config';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import path from 'path';

// ✅ Veilig opgehaalde environment variables
const API_KEY = process.env.CRON_API_KEY;
if (!API_KEY) {
  const message = 'CRON_API_KEY environment variable is missing';
  console.error(message);
  throw new Error(message);
}

const CRON_BYPASS_KEY = process.env.CRON_BYPASS_KEY;
if (!CRON_BYPASS_KEY) {
  const message = 'CRON_BYPASS_KEY environment variable is missing';
  console.error(message);
  throw new Error(message);
}

async function withTimeout<T>(promise: Promise<T>, ms = 60_000): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'];
  const cronBypassKey = req.headers['x-cron-key'];

  if (apiKey === API_KEY) {
    console.log('✅ Valid API key');
  } else if (cronBypassKey && cronBypassKey === CRON_BYPASS_KEY) {
    console.log('✅ CRON bypass key accepted');
  } else {
    console.warn('❌ Unauthorized: Invalid API key and no valid bypass key');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔄 CRON job started: processing unindexed documents');

    const limit = parseInt(req.query.limit as string) || 10;

    const { data: documents, error: fetchError } = await supabase
      .from('documents_metadata')
      .select('*')
      .eq('ready_for_indexing', true)
      .eq('processed', false)
      .order('last_updated', { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error('❌ Error fetching documents:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    if (!documents || documents.length === 0) {
      console.log('✅ No documents to process');
      return res.status(200).json({ message: 'No documents to process' });
    }

    console.log(`[CRON] batch size=${documents.length}`);

    const pipeline = new RAGPipeline(supabaseAdmin, openaiApiKey);

    const results: {
      id: string;
      filename: string;
      success: boolean;
      error?: string;
      chunk_count?: number;
    }[] = [];

    const SUPPORTED_MIME_TYPES = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'application/msword',
      'application/vnd.oasis.opendocument.text',
      'text/csv',
      'text/rtf',
    ];

    const SUPPORTED_EXTENSIONS = [
      '.pdf',
      '.docx',
      '.txt',
      '.md',
      '.doc',
      '.odt',
      '.csv',
      '.rtf',
    ];

    for (const document of documents) {
      try {
        console.log(`[CRON] 🔧 Processing: ${document.filename}`);

        const extension = path.extname(document.filename || '').toLowerCase();
        const mimeType = (document.mime_type || '').toLowerCase();
        const isSupported =
          SUPPORTED_MIME_TYPES.includes(mimeType) || SUPPORTED_EXTENSIONS.includes(extension);

        if (!isSupported) {
          const message = `Unsupported file type: ${mimeType || extension}`;
          console.warn(`[CRON] ⚠️ Skipping ${document.filename}: ${message}`);

          await supabaseAdmin
            .from('documents_metadata')
            .update({
              processed: true,
              processed_at: new Date().toISOString(),
              chunk_count: 0,
              last_error: message,
            })
            .eq('id', document.id);

          results.push({ id: document.id, filename: document.filename, success: false, error: message });
          continue;
        }

        const { data: fileData, error: downloadError } = await supabase
          .storage
          .from('company-docs')
          .download(document.storage_path);

        if (downloadError) throw new Error(`Failed to download: ${downloadError.message}`);

        const arrayBuffer = await fileData.arrayBuffer();
        let extractedText = '';

        if (document.mime_type === 'application/pdf' || document.filename.endsWith('.pdf')) {
          const buffer = Buffer.from(arrayBuffer);
          const pdfData = await pdfParse(buffer);
          extractedText = pdfData.text;
        } else if (
          document.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          document.filename.endsWith('.docx')
        ) {
          const buffer = Buffer.from(arrayBuffer);
          const docxData = await mammoth.extractRawText({ buffer });
          extractedText = docxData.value;
        } else {
          extractedText = await fileData.text();
        }

        if (!extractedText || extractedText.trim().length === 0) {
          const message = 'No text found - needs OCR';
          await supabaseAdmin
            .from('documents_metadata')
            .update({
              processed: true,
              processed_at: new Date().toISOString(),
              chunk_count: 0,
              last_error: message,
              needs_ocr: true,
            })
            .eq('id', document.id);

          results.push({ id: document.id, filename: document.filename, success: false, error: message });
          continue;
        }

        console.time(`[CRON] doc ${document.id}`);
        let chunkCountFromPipeline: number | undefined;
        try {
          const metadata = { ...document, extractedText } as any;
          const result: any = await withTimeout(
            pipeline.processDocument(
              metadata,
              {
                chunkSize: RAG_CONFIG.chunkSize,
                chunkOverlap: RAG_CONFIG.chunkOverlap,
                skipExisting: false,
              }
            )
          );
          if (typeof result === 'number') chunkCountFromPipeline = result;
          else if (result?.chunkCount != null) chunkCountFromPipeline = result.chunkCount;
          else if (Array.isArray(result?.chunks)) chunkCountFromPipeline = result.chunks.length;
        } finally {
          console.timeEnd(`[CRON] doc ${document.id}`);
        }
        const finalChunkCount =
          chunkCountFromPipeline ?? Math.max(1, Math.ceil(extractedText.length / 2000));

        await supabaseAdmin
          .from('documents_metadata')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            chunk_count: finalChunkCount,
            last_error: null,
          })
          .eq('id', document.id);

        console.log(`[CRON] ✅ ${document.filename} → ${finalChunkCount} chunks`);

        results.push({
          id: document.id,
          filename: document.filename,
          success: true,
          chunk_count: finalChunkCount,
        });
      } catch (error) {
        const err = error as Error;
        console.error(`[CRON] ❌ Error processing ${document.filename}:`, err.message);

        await supabaseAdmin
          .from('documents_metadata')
          .update({
            last_error: `Processing failed: ${err.message}`,
          })
          .eq('id', document.id);

        results.push({ id: document.id, filename: document.filename, success: false, error: err.message });
      }
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({ ok: true, count: results.length, results });
  } catch (error) {
    const err = error as Error;
    console.error('❌ CRON job failed:', err.message);
    return res.status(500).json({ error: 'Unexpected error', details: err.message });
  }
}
