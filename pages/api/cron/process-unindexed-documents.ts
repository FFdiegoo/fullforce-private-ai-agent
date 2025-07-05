import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { RAGPipeline } from '../../../lib/rag/pipeline';
import { openaiApiKey, RAG_CONFIG } from '../../../lib/rag/config';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

const API_KEY = process.env.CRON_API_KEY || 'default-secure-key-change-me';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (!apiKey || apiKey !== API_KEY) {
    console.error('❌ Invalid API key');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔄 Starting CRON job to process unindexed documents');

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
      return res.status(500).json({ error: 'Failed to fetch documents', details: fetchError.message });
    }

    if (!documents || documents.length === 0) {
      console.log('✅ No documents need processing');
      return res.status(200).json({ message: 'No documents need processing' });
    }

    console.log(`📊 Found ${documents.length} documents to process`);
    const results = [];

    for (const document of documents) {
      try {
        console.log(`[CRON] Processing ${document.filename} (ID: ${document.id})`);
        
        const { data: fileData, error: downloadError } = await supabase
          .storage
          .from('company-docs')
          .download(document.storage_path);

        if (downloadError) {
          throw new Error(`Download failed: ${downloadError.message}`);
        }

        let extractedText = '';

        if (document.mime_type === 'application/pdf' || document.filename.toLowerCase().endsWith('.pdf')) {
          const pdfData = await pdfParse(Buffer.from(await fileData.arrayBuffer()));
          extractedText = pdfData.text;
          console.log(`[CRON] [EXTRACTED] ${document.filename} (${extractedText.length} chars) from PDF`);
        } else if (
          document.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          document.filename.toLowerCase().endsWith('.docx')
        ) {
          const docxData = await mammoth.extractRawText({ buffer: Buffer.from(await fileData.arrayBuffer()) });
          extractedText = docxData.value;
          console.log(`[CRON] [EXTRACTED] ${document.filename} (${extractedText.length} chars) from DOCX`);
        } else if (
          document.mime_type === 'text/plain' ||
          document.filename.toLowerCase().endsWith('.txt')
        ) {
          extractedText = await fileData.text();
          console.log(`[CRON] [EXTRACTED] ${document.filename} (${extractedText.length} chars) from text file`);
        } else {
          try {
            extractedText = await fileData.text();
            console.log(`[CRON] [EXTRACTED] ${document.filename} (${extractedText.length} chars) using fallback`);
          } catch (textError) {
            throw new Error(`Unsupported file format: ${document.mime_type}`);
          }
        }

        if (!extractedText || extractedText.trim().length === 0) {
          throw new Error('No text could be extracted from document');
        }

        document.extractedText = extractedText;

        const pipeline = new RAGPipeline(supabase, openaiApiKey);
        await pipeline.processDocument(document, {
          chunkSize: RAG_CONFIG.chunkSize,
          chunkOverlap: RAG_CONFIG.chunkOverlap,
          skipExisting: false,
        });

        const { count: chunkCount, error: countError } = await supabase
          .from('document_chunks')
          .select('*', { count: 'exact', head: true })
          .eq('metadata->>id', document.id);

        if (countError) {
          console.error('❌ Error getting chunk count:', countError);
        }

        await supabaseAdmin
          .from('documents_metadata')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            chunk_count: chunkCount || 0,
            last_error: null
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
            last_error: `Processing failed: ${err.message}`
          })
          .eq('id', document.id);

        results.push({ id: document.id, filename: document.filename, success: false, error: err.message });
      }
    }

    return res.status(200).json({
      message: `Processed ${results.length} documents`,
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });

  } catch (error) {
    const err = error as Error;
    console.error('❌ CRON job error:', err.message);
    return res.status(500).json({
      error: 'Failed to process documents',
      details: err.message
    });
  }
}
