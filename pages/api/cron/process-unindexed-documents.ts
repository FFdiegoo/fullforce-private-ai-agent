import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { DocumentProcessor } from '../../../lib/document-processor';

// ✅ Environment vars
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

    // Initialize document processor
    const processor = new DocumentProcessor(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      OPENAI_API_KEY,
      {
        chunkSize: 1000,
        chunkOverlap: 200
      }
    );

    // Process documents
    const results = await processor.processDocuments(limit);

    return res.status(200).json({
      message: `Processed ${results.processed} documents`,
      processed: results.successful,
      failed: results.failed,
      results: results.results.map(r => ({
        id: r.documentId,
        filename: r.filename,
        success: r.success,
        chunkCount: r.chunksCreated,
        error: r.error
      }))
    });

  } catch (error: any) {
    console.error('💥 CRON job failed:', error.message);
    return res.status(500).json({ 
      error: 'Processing failed', 
      details: error.message 
    });
  }
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
