import type { NextApiRequest, NextApiResponse } from 'next';
import { getOrCreateSession } from '../../../lib/chat/session';
import { supabaseAdmin } from '../../../lib/server/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { sessionId } = await getOrCreateSession(req, res);

    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content, created_at, sources')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.status(200).json({ messages: data || [] });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
}
