import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { name, role: 'user' }
    });
    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
