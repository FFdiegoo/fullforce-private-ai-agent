import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { RAGPipeline } from '../../../lib/rag/pipeline';
import { openaiApiKey, RAG_CONFIG } from '../../../lib/rag/config';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import path from 'path';
// import Tesseract from 'tesseract.js'; // OCR verplaatst naar aparte worker
import JSZip from 'jszip';

const API_KEY = (process.env.CRON_API_KEY ?? '').trim();
const CRON_BYPASS_KEY = (process.env.CRON_BYPASS_KEY ?? '').trim();
if (!API_KEY) throw new Error('CRON_API_KEY missing');
if (!CRON_BYPASS_KEY) throw new Error('CRON_BYPASS_KEY missing');

const PER_DOC_MS = 20_000;
function withTimeout<T>(p: Promise<T>, ms = PER_DOC_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('doc-timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // --- Auth parsing (query or header for API_KEY, header only for BYPASS) ---
  const qp = Array.isArray(req.query.key) ? req.query.key[0] : (req.query.key as string | undefined);
  const headerApi = (req.headers['x-api-key'] as string | undefined) ?? (req.headers['x-Api-Key'] as string | undefined);
  const headerBypass = req.headers['x-cron-key'] as string | undefined; // Node lowercases headers
  const provided = (headerApi ?? qp ?? '').toString().trim();
  const tail = (s?: string) => s ? s.slice(-6) : 'none';
  console.log('[AUTH] provided tail=', tail(provided), '| env tail=', tail(API_KEY));

  if (provided && provided === API_KEY) {
    console.log('✅ Valid API key');
  } else if (headerBypass && headerBypass.trim() === CRON_BYPASS_KEY) {
    console.log('✅ CRON bypass key accepted');
  } else {
    console.warn('❌ Unauthorized: Invalid API key and no valid bypass key');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const rawLimit = Number(req.query.limit ?? 5);
    const limit = Math.min(Math.max(isFinite(rawLimit) ? rawLimit : 5, 1), 10);
    console.log(`🔄 CRON start | limit=${limit}`);

    const { data: documents, error: fetchError } = await supabaseAdmin
      .from('documents_metadata')
      .select('id, filename, mime_type, storage_path, last_updated')
      .eq('ready_for_indexing', true)
      .eq('processed', false)
      .order('last_updated', { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error('❌ Error fetching documents:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    if (!documents?.length) {
      console.log('✅ No documents to process');
      return res.status(200).json({ message: 'No documents to process' });
    }

    console.log(`[CRON] fetched ${documents.length} docs`);

    const results: any[] = [];
    const SUPPORTED_MIME_TYPES = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'application/msword',
    ];
    const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md'];

    for (const document of documents) {
      try {
        console.log(`[CRON] 🔧 Processing: id=${document.id} | ${document.filename} | ${document.mime_type}`);
        const extension = (path.extname(document.filename || '').toLowerCase());
        const mimeType = (document.mime_type || '').toLowerCase();
        const isSupported = SUPPORTED_MIME_TYPES.includes(mimeType) || SUPPORTED_EXTENSIONS.includes(extension);
        if (!isSupported) {
          const message = `unsupported-type:${mimeType || extension}`;
          console.warn(`[CRON] ⚠️ Skip ${document.filename}: ${message}`);
          await supabaseAdmin.from('documents_metadata').update({
            processed: true,
            processed_at: new Date().toISOString(),
            chunk_count: 0,
            last_error: message,
          }).eq('id', document.id);
          results.push({ id: document.id, filename: document.filename, success: false, error: message, chunk_count: 0 });
          continue;
        }

        const { data: fileData, error: downloadError } = await supabaseAdmin
          .storage.from('company-docs').download(document.storage_path);
        if (downloadError) throw new Error(`download-failed:${downloadError.message}`);

        const arrayBuffer = await fileData.arrayBuffer();
        let extractedText = '';

        if (mimeType === 'application/pdf' || extension === '.pdf') {
          const pdfData = await withTimeout(pdfParse(Buffer.from(arrayBuffer)));
          extractedText = (pdfData.text ?? '').trim();
          if (!extractedText) {
            console.log(`[CRON] 🖼️ image-only PDF → mark needs_ocr=true`);
            await supabaseAdmin.from('documents_metadata').update({
              processed: true,
              processed_at: new Date().toISOString(),
              chunk_count: 0,
              needs_ocr: true,
              last_error: 'image-only-pdf',
            }).eq('id', document.id);
            results.push({ id: document.id, filename: document.filename, success: false, error: 'image-only-pdf', chunk_count: 0 });
            continue;
          }
        } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extension === '.docx') {
          const { value } = await withTimeout(mammoth.extractRawText({ arrayBuffer }));
          extractedText = (value ?? '').trim();
        } else if (mimeType === 'application/msword' || extension === '.doc' || mimeType === 'text/plain' || extension === '.txt' || mimeType === 'text/markdown' || extension === '.md') {
          extractedText = Buffer.from(arrayBuffer).toString('utf8');
        }

        if (!extractedText) {
          const message = 'empty-text-after-parse';
          await supabaseAdmin.from('documents_metadata').update({
            processed: true,
            processed_at: new Date().toISOString(),
            chunk_count: 0,
            last_error: message,
          }).eq('id', document.id);
          results.push({ id: document.id, filename: document.filename, success: false, error: message, chunk_count: 0 });
          continue;
        }

        const chunkCount = Math.max(1, Math.ceil(extractedText.length / 2000));
        await supabaseAdmin.from('documents_metadata').update({
          processed: true,
          processed_at: new Date().toISOString(),
          chunk_count: chunkCount,
          last_error: null,
        }).eq('id', document.id);

        results.push({ id: document.id, filename: document.filename, success: true, chunk_count: chunkCount });
      } catch (err: any) {
        const msg = (err?.message ?? 'unknown-error');
        console.error(`[CRON] ❌ Doc failed id=${document.id} | ${document.filename} | ${msg}`);
        await supabaseAdmin.from('documents_metadata').update({
          processed: true,
          processed_at: new Date().toISOString(),
          chunk_count: 0,
          last_error: msg,
        }).eq('id', document.id);
        results.push({ id: document.id, filename: document.filename, success: false, error: msg, chunk_count: 0 });
      }
    }

    return res.status(200).json({ ok: true, count: results.length, results });
  } catch (e: any) {
    console.error('[CRON] top-level error', e?.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

