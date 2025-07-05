import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { RAGPipeline } from '../../../lib/rag/pipeline';
import { openaiApiKey, RAG_CONFIG } from '../../../lib/rag/config';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// Configure API key validation
const API_KEY = process.env.CRON_API_KEY || 'default-secure-key-change-me';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate API key
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (!apiKey || apiKey !== API_KEY) {
    console.error('❌ Invalid API key');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔄 Starting CRON job to process unindexed documents');

    // Get limit from query params or default to 10
    const limit = parseInt(req.query.limit as string) || 10;
    
    // Find documents that are ready for indexing but not processed
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
    
    // Process each document
    const results = [];
    for (const document of documents) {
      try {
        console.log(`[CRON] Processing ${document.filename} (ID: ${document.id})`);
        
        // Download document from storage
        const { data: fileData, error: downloadError } = await supabase
          .storage
          .from('company-docs')
          .download(document.storage_path);

        if (downloadError) {
          throw new Error(`Download failed: ${downloadError.message}`);
        }

        // Extract text based on file type
        let extractedText = '';
        
        if (document.mime_type === 'application/pdf' || document.filename.toLowerCase().endsWith('.pdf')) {
          // PDF extraction
          const pdfData = await pdfParse(Buffer.from(await fileData.arrayBuffer()));
          extractedText = pdfData.text;
          const wordCount = extractedText.split(/\s+/).length;
          console.log(`[CRON] [EXTRACTED] ${document.filename} (${wordCount} words, ${extractedText.length} chars) from PDF`);
        } 
        else if (
          document.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
          document.filename.toLowerCase().endsWith('.docx')
        ) {
          // DOCX extraction
          const docxData = await mammoth.extractRawText({
            buffer: Buffer.from(await fileData.arrayBuffer())
          });
          extractedText = docxData.value;
          const wordCount = extractedText.split(/\s+/).length;
          console.log(`[CRON] [EXTRACTED] ${document.filename} (${wordCount} words, ${extractedText.length} chars) from DOCX`);
        }
        else if (
          document.mime_type === 'text/plain' || 
          document.filename.toLowerCase().endsWith('.txt')
        ) {
          // Plain text
          extractedText = await fileData.text();
          const wordCount = extractedText.split(/\s+/).length;
          console.log(`[CRON] [EXTRACTED] ${document.filename} (${wordCount} words, ${extractedText.length} chars) from text file`);
        }
        else {
          // Fallback for other formats - try as text
          try {
            extractedText = await fileData.text();
            const wordCount = extractedText.split(/\s+/).length;
            console.log(`[CRON] [EXTRACTED] ${document.filename} (${wordCount} words, ${extractedText.length} chars) using fallback for ${document.mime_type}`);
          } catch (textError) {
            throw new Error(`Unsupported file format: ${document.mime_type}`);
          }
        }

        if (!extractedText || extractedText.trim().length === 0) {
          throw new Error('No text could be extracted from document');
        }

        // Add extracted text to document metadata
        document.extractedText = extractedText;

        // Process document with RAG pipeline
        const pipeline = new RAGPipeline(supabase, openaiApiKey);
        await pipeline.processDocument(document, {
          chunkSize: RAG_CONFIG.chunkSize,
          chunkOverlap: RAG_CONFIG.chunkOverlap,
          skipExisting: false,
        });

        // Get chunk count after processing
        const { count: chunkCount, error: countError } = await supabase
          .from('document_chunks')
          .select('*', { count: 'exact', head: true })
          .eq('metadata->id', document.id);

        if (countError) {
          console.error('❌ Error getting chunk count:', countError);
        }

        // Update document status to processed with chunk count
        await supabaseAdmin
          .from('documents_metadata')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            chunk_count: chunkCount || 0,
            last_error: null // Clear any previous errors
          })
          .eq('id', document.id);

        console.log(`[CRON] ✅ ${document.filename} → ${chunkCount || 0} chunks`);
        
        results.push({
          id: document.id,
          filename: document.filename,
          success: true,
          chunkCount: chunkCount || 0
        });
      } catch (error) {
  const err = error as Error;
  console.error(`[CRON] ❌ Error processing ${document.filename}:`, err.message);
        
        // Update document with error
        await supabaseAdmin
          .from('documents_metadata')
          .update({
            last_error: `Processing failed: ${error.message}`
          })
          .eq('id', document.id);
        
        results.push({
          id: document.id,
          filename: document.filename,
          success: false,
          error: error.message
        });
      }
    }

    // Return results
    return res.status(200).json({
      message: `Processed ${results.length} documents`,
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });

  } catch (error) {
    console.error('❌ CRON job error:', error);
    return res.status(500).json({ 
      error: 'Failed to process documents', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}