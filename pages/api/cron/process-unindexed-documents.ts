import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';
import { waitUntil } from '@vercel/functions';

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
    console.log('🔄 CRON job started: queueing unindexed documents');

    const limit = parseInt(req.query.limit as string) || 10;

    const { data: documents, error: fetchError } = await supabase
      .from('documents_metadata')
      .select('id')
      .eq('ready_for_indexing', true)
      .eq('processed', false)
      .order('last_updated', { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error('❌ Error fetching documents:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    if (!documents || documents.length === 0) {
      console.log('✅ No documents to queue');
      return res.status(200).json({ message: 'No documents to process' });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    for (const doc of documents) {
      waitUntil(
        fetch(`${siteUrl}/api/process-document`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: doc.id }),
        })
          .then(() => console.log(`🕒 Queued document ${doc.id}`))
          .catch(err =>
            console.error(`⚠️ Failed to queue document ${doc.id}:`, err)
          )
      );
    }

    return res.status(200).json({
      message: `Queued ${documents.length} document(s) for processing`,
      queued: documents.map(d => d.id),
    });
  } catch (error) {
    const err = error as Error;
    console.error('❌ CRON job failed:', err.message);
    return res.status(500).json({ error: 'Unexpected error', details: err.message });
  }
}
