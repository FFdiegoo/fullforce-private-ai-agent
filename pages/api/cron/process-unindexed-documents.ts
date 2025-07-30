import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { EnhancedDocumentProcessor } from '../../../lib/document-processor-enhanced';

// Environment vars
const API_KEY = process.env.CRON_API_KEY || 'default-key';
const CRON_BYPASS_KEY = process.env.CRON_BYPASS_KEY || 'fallback-key';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Validate required environment variables
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is required');
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

    // Validate OpenAI API key
    if (!OPENAI_API_KEY) {
      console.error('❌ OpenAI API key not configured');
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Initialize enhanced document processor
    const processor = new EnhancedDocumentProcessor(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      OPENAI_API_KEY,
      {
        chunkSize: 1000,
        chunkOverlap: 200
      }
    );

    console.log(`🔄 Starting CRON job to process up to ${limit} documents`);

    // Process documents
    const results = await processor.processDocuments(limit);

    console.log(`✅ CRON job completed: ${results.successful}/${results.processed} documents processed successfully`);

    return res.status(200).json({
      success: true,
      message: `CRON job completed: processed ${results.processed} documents`,
      results: {
        processed: results.processed,
        successful: results.successful,
        failed: results.failed,
        total_time_ms: results.totalTime
      },
      documents: results.results.map(r => ({
        id: r.documentId,
        filename: r.filename,
        success: r.success,
        chunks_created: r.chunksCreated,
        processing_time_ms: r.processingTime,
        error: r.error
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('💥 CRON job failed:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'CRON processing failed', 
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}