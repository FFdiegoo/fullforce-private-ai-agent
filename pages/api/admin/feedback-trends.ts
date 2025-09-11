import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabaseClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabase.rpc('get_feedback_trends');
    if (error) throw error;
    return res.status(200).json({ trends: data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
