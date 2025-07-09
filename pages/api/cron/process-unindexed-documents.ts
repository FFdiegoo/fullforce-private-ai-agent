import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { RAGPipeline } from '../../../lib/rag/pipeline';
import { openaiApiKey, RAG_CONFIG } from '../../../lib/rag/config';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// ✅ Veilig opgehaalde environment variables
const API_KEY = process.env.CRON_API_KEY || 'default-key';
const CRON_BYPASS_KEY = process.env.CRON_BYPASS_KEY || 'fallback-key';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 🧪 Debug info
  console.log('🔐 Loaded API_KEY:', API_KEY);
  console.log('🔐 Loaded CRON_BYPASS_KEY:', CRON_BYPASS_KEY);
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

    for (const document of documents) {
      try {
        console.log(`[CRON] 🔧 Processing: ${document.filename}`);

        const { data: fileData, error: downloadError } = await supabaseAdmin
          .storage
          .from('company-docs')
          .download(document.storage_path);

        if (downloadError) throw new Error(`Failed to download: ${downloadError.message}`);

        let extractedText = '';

        if (document.mime_type === 'application/pdf' || document.filename.endsWith('.pdf')) {
          const pdfData = await pdfParse(Buffer.from(await fileData.arrayBuffer()));
          extractedText = pdfData.text;
        } else if (
          document.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          document.filename.endsWith('.docx')
        ) {
          const docxData = await mammoth.extractRawText({
            buffer: Buffer.from(await fileData.arrayBuffer()),
          });
          extractedText = docxData.value;
        } else {
          extractedText = await fileData.text();
        }

        if (!extractedText || extractedText.trim().length === 0) {
          throw new Error('No text extracted');
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
