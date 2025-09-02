import { NextApiRequest, NextApiResponse } from 'next';
import { OpenAI } from 'openai';
import { openaiApiKey } from '../../lib/rag/config';

const openai = new OpenAI({ apiKey: openaiApiKey });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_SIMPLE || 'gpt-4-turbo',
      messages: [
        { role: 'system', content: 'Genereer een korte titel (maximaal 6 woorden) voor het volgende chatgesprek.' },
        { role: 'user', content: message }
      ],
      max_tokens: 20,
      temperature: 0.7
    });

    const title = completion.choices?.[0]?.message?.content?.trim();
    if (!title) {
      return res.status(500).json({ error: 'Failed to generate title' });
    }
    return res.status(200).json({ title });
  } catch (error) {
    console.error('Error generating title:', error);
    return res.status(500).json({ error: 'Failed to generate title' });
  }
}
