import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Test basic connection
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('count')
      .limit(1);

    if (error) {
      console.error('Database connection error:', error);
      return res.status(500).json({ 
        error: 'Database connection failed', 
        details: error.message 
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Database connection successful',
      data 
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ 
      error: 'Unexpected error', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}