import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { RAGPipeline } from '../../../lib/rag/pipeline';
import { openaiApiKey, RAG_CONFIG } from '../../../lib/rag/config';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';
import JSZip from 'jszip';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch next item from the queue
    const { data: task, error: taskError } = await supabaseAdmin
      .from('document_processing_queue')
      .select('*')
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (taskError) {
      console.error('❌ Error fetching queue:', taskError);
      return res.status(500).json({ error: 'Failed to fetch queue' });
    }

    if (!task) {
      return res.status(200).json({ message: 'No queued documents' });
    }

    const { data: document, error: docError } = await supabaseAdmin
      .from('documents_metadata')
      .select('*')
      .eq('id', task.document_id)
      .maybeSingle();

    if (docError || !document) {
      console.error('❌ Failed to load document metadata:', docError);
      return res.status(500).json({ error: 'Document not found' });
    }

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

    const extension = path.extname(document.filename || '').toLowerCase();
    const mimeType = (document.mime_type || '').toLowerCase();
    const isSupported =
      SUPPORTED_MIME_TYPES.includes(mimeType) || SUPPORTED_EXTENSIONS.includes(extension);

    if (!isSupported) {
      const message = `Unsupported file type: ${mimeType || extension}`;
      console.warn(`[WORKER] ⚠️ Skipping ${document.filename}: ${message}`);

      await supabaseAdmin
        .from('documents_metadata')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          chunk_count: 0,
          last_error: message,
        })
        .eq('id', document.id);

      await supabaseAdmin
        .from('document_processing_queue')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', task.id);

      return res.status(200).json({ message: 'Skipped unsupported document', id: document.id });
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
        console.log(`[WORKER] 🖼️ ${document.filename} appears to be image-only, running OCR`);
        try {
          const ocrResult = await Tesseract.recognize(buffer, 'eng');
          extractedText = ocrResult.data.text;
        } catch (ocrErr) {
          console.error(`[WORKER] ⚠️ OCR failed for ${document.filename}:`, ocrErr);
        }
      }
    } else if (
      document.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      document.filename.endsWith('.docx')
    ) {
      const buffer = Buffer.from(arrayBuffer);
      const docxData = await mammoth.extractRawText({ buffer });
      extractedText = docxData.value;
      if (!extractedText.trim()) {
        console.log(`[WORKER] 🖼️ ${document.filename} contains images only, attempting OCR`);
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
          console.error(`[WORKER] ⚠️ OCR failed for ${document.filename}:`, ocrErr);
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

      await supabaseAdmin
        .from('document_processing_queue')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', task.id);

      return res.status(200).json({ message: 'No text extracted', id: document.id });
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

    await supabaseAdmin
      .from('document_processing_queue')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', task.id);

    console.log(`[WORKER] ✅ ${document.filename} → ${chunkCount || 0} chunks`);

    return res.status(200).json({ message: 'Processed document', id: document.id, chunkCount: chunkCount || 0 });
  } catch (error) {
    const err = error as Error;
    console.error('❌ Worker failed:', err.message);
    return res.status(500).json({ error: 'Unexpected error', details: err.message });
  }
}
