import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { RAGPipeline } from '../../../lib/rag/pipeline';
import { openaiApiKey, RAG_CONFIG } from '../../../lib/rag/config';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import path from 'path';
import Tesseract from 'tesseract.js';
import JSZip from 'jszip';

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 🧪 Debug info
  console.log('🔐 API key loaded');
  console.log('🔐 CRON bypass key loaded');
  console.log('🔎 Request headers:', req.headers);

  const apiKey = req.headers['x-api-key'] || req.query.key;
  const cronBypassKey = req.headers['x-cron-key'] || req.headers['X-Cron-Key'];

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

    const results = [];

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
          if (!extractedText.trim()) {
            console.log(`[CRON] 🖼️ ${document.filename} appears to be image-only, running OCR`);
            try {
              const ocrResult = await Tesseract.recognize(buffer, 'eng');
              extractedText = ocrResult.data.text;
            } catch (ocrErr) {
              console.error(`[CRON] ⚠️ OCR failed for ${document.filename}:`, ocrErr);
            }
          }
        } else if (
          document.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          document.filename.endsWith('.docx')
        ) {
          const buffer = Buffer.from(arrayBuffer);
          const docxData = await mammoth.extractRawText({
            buffer,
          });
          extractedText = docxData.value;
          if (!extractedText.trim()) {
            console.log(`[CRON] 🖼️ ${document.filename} contains images only, attempting OCR`);
            try {
              const zip = await JSZip.loadAsync(buffer);
              const media = zip.folder('word/media');
              if (media) {
                let ocrText = '';
                const imagePromises: Promise<Buffer>[] = [];
                media.forEach((relativePath, file) => {
                  imagePromises.push(file.async('nodebuffer'));
                });
                const imageBuffers = await Promise.all(imagePromises);
                for (const img of imageBuffers) {
                  const ocrResult = await Tesseract.recognize(img, 'eng');
                  ocrText += ocrResult.data.text + '\n';
                }
                extractedText = ocrText;
              }
            } catch (ocrErr) {
              console.error(`[CRON] ⚠️ OCR failed for ${document.filename}:`, ocrErr);
            }
          }
        } else {
          extractedText = await fileData.text();
        }

        if (!extractedText || extractedText.trim().length === 0) {
          const message = 'No text found (even with OCR)';
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

        document.extractedText = extractedText;

        const pipeline = new RAGPipeline(supabaseAdmin, openaiApiKey);
        await pipeline.processDocument(document, {
          chunkSize: RAG_CONFIG.chunkSize,
          chunkOverlap: RAG_CONFIG.chunkOverlap,
          skipExisting: false,
        });

        const { count: chunkCount, error: countError } = await supabaseAdmin
          .from('document_chunks')
          .select('*', { count: 'exact', head: true })
          .eq('metadata->id', document.id);

        if (countError) {
          console.error('⚠️ Error counting chunks:', countError.message);
        }

        await supabaseAdmin
          .from('documents_metadata')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            chunk_count: chunkCount || 0,
            last_error: null,
          })
          .eq('id', document.id);

        console.log(`[CRON] ✅ ${document.filename} → ${chunkCount || 0} chunks`);

        results.push({ id: document.id, filename: document.filename, success: true, chunkCount: chunkCount || 0 });
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

    return res.status(200).json({
      message: `Processed ${results.length} document(s)`,
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (error) {
    const err = error as Error;
    console.error('❌ CRON job failed:', err.message);
    return res.status(500).json({ error: 'Unexpected error', details: err.message });
  }
}
