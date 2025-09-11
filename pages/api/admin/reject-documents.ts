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
      const { data } = await supabaseAdmin
        .from('documents_metadata')
        .select('storage_path')
        .eq('id', id)
        .single();

      if (data?.storage_path) {
        await supabaseAdmin.storage.from('company-docs').remove([data.storage_path]);
      }

      await supabaseAdmin
        .from('documents_metadata')
        .delete()
        .eq('id', id);
    }
    return res.status(200).json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
