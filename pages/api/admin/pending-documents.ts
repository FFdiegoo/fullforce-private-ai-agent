import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('documents_metadata')
      .select('id, filename')
      .eq('ready_for_indexing', false);

    if (error) throw error;
    return res.status(200).json({ documents: data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
