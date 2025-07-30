import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabaseClient';
import { EnhancedDocumentProcessor } from '../../lib/document-processor-enhanced';
import { auditLogger } from '../../lib/audit-logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { document_id, safe_filename, batch_size = 5 } = req.body;

    if (!document_id && !safe_filename) {
      return res.status(400).json({ error: 'Document ID or safe filename required' });
    }

    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing required environment variables' });
    }

    // Initialize enhanced document processor
    const processor = new EnhancedDocumentProcessor(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.OPENAI_API_KEY,
      {
        chunkSize: 1000,
        chunkOverlap: 200
      }
    );

    if (document_id) {
      // Process specific document
      const { data: document, error: docError } = await supabase
        .from('documents_metadata')
        .select('*')
        .eq('id', document_id)
        .single();

      if (docError || !document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      console.log(`🔄 Processing document: ${document.filename}`);
      const result = await processor.processDocument(document);

      await auditLogger.logAuth('DOCUMENT_PROCESSED', user.id, {
        documentId: document_id,
        filename: document.filename,
        success: result.success,
        chunksCreated: result.chunksCreated
      });

      return res.status(200).json({
        success: result.success,
        document_id: result.documentId,
        filename: result.filename,
        chunks_created: result.chunksCreated,
        processing_time_ms: result.processingTime,
        error: result.error,
        message: result.success 
          ? `Document processed successfully with ${result.chunksCreated} chunks`
          : `Document processing failed: ${result.error}`
      });

    } else {
      // Process multiple documents (batch processing)
      console.log(`🔄 Processing batch of ${batch_size} documents`);
      const results = await processor.processDocuments(batch_size);

      await auditLogger.logAuth('BATCH_DOCUMENTS_PROCESSED', user.id, {
        batchSize: batch_size,
        processed: results.processed,
        successful: results.successful,
        failed: results.failed,
        totalTime: results.totalTime
      });

      return res.status(200).json({
        success: true,
        batch_results: {
          processed: results.processed,
          successful: results.successful,
          failed: results.failed,
          total_time_ms: results.totalTime
        },
        results: results.results.map(r => ({
          document_id: r.documentId,
          filename: r.filename,
          success: r.success,
          chunks_created: r.chunksCreated,
          processing_time_ms: r.processingTime,
          error: r.error
        })),
        message: `Batch processing complete: ${results.successful}/${results.processed} documents processed successfully`
      });
    }

  } catch (error) {
    console.error('Ingest error:', error);
    await auditLogger.logError(error as Error, 'DOCUMENT_INGEST');
    
    res.status(500).json({
      error: 'Document ingestion failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}