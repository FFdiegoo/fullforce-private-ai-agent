import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabaseClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select('id, title, mode, updated_at, archived, profiles!inner(email)')
      .order('updated_at', { ascending: false });

    if (error || !sessions) {
      return res.status(500).json({ error: 'Failed to fetch sessions' });
    }

    const sessionsWithFeedback = await Promise.all(
      sessions.map(async (session: any) => {
        const { data: feedback } = await supabase
          .from('message_feedback')
          .select('message_id, created_at')
          .eq('session_id', session.id)
          .eq('feedback_type', 'thumbs_down')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return {
          id: session.id,
          title: session.title,
          mode: session.mode,
          updated_at: session.updated_at,
          archived: session.archived,
          user_email: session.profiles.email,
          last_thumbs_down: feedback || null
        };
      })
    );

    return res.status(200).json(sessionsWithFeedback);
  } catch (error) {
    console.error('Error fetching admin chat sessions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
