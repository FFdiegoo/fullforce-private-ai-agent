import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Test basic connection by listing models
    const models = await openai.models.list();

    return res.status(200).json({ 
      success: true, 
      message: 'OpenAI connection successful',
      modelCount: models.data.length
    });
  } catch (error) {
    console.error('OpenAI connection error:', error);
    return res.status(500).json({ 
      error: 'OpenAI connection failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}