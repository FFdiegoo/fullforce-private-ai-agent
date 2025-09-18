import { v4 as uuidv4 } from 'uuid';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../server/supabaseAdmin';

const COOKIE_NAME = 'chat_session';

export async function getOrCreateSession(req: NextApiRequest, res: NextApiResponse) {
  let sessionKey = req.cookies?.[COOKIE_NAME];

  if (!sessionKey) {
    sessionKey = uuidv4();
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${sessionKey}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  }

  // ensure session row
  const { data: existing } = await supabaseAdmin
    .from('chat_sessions')
    .select('id')
    .eq('session_key', sessionKey)
    .maybeSingle();

  if (existing) return { sessionId: existing.id, sessionKey };

  const { data: created, error } = await supabaseAdmin
    .from('chat_sessions')
    .insert({ session_key: sessionKey })
    .select('id')
    .single();

  if (error) throw error;
  return { sessionId: created!.id, sessionKey };
}
