import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { RAGPipeline } from '../../../lib/rag/pipeline';
import { openaiApiKey, RAG_CONFIG } from '../../../lib/rag/config';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import path from 'path';
import OpenAI from 'openai';

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

  const apiKey = req.headers['x-api-key'] as string | undefined;
  const cronBypassKey = req.headers['x-cron-key'] as string | undefined;

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

    const { data: documents, error: fetchError } = await supabaseAdmin
      .from('documents_metadata')
      .select('*')
      .eq('ready_for_indexing', true)
      .eq('processed', false)
      .order('last_updated', { ascending: true })
      .
