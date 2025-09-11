import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ids } = req.body as { ids: string[] };
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Invalid ids' });

  try {
    for (const id of ids) {
      await supabaseAdmin
        .from('documents_metadata')
        .update({ ready_for_indexing: true })
        .eq('id', id);
      await fetch(`${req.headers.origin}/api/process-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
    }
    return res.status(200).json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
