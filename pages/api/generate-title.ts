import { NextApiRequest, NextApiResponse } from 'next';
import { OpenAI } from 'openai';
import { openaiApiKey } from '../../lib/rag/config';

const openai = new OpenAI({ apiKey: openaiApiKey });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body as { prompt?: string };
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You create short, descriptive chat titles (max 6 words).'
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 12,
    });

    const title = completion.choices[0]?.message?.content?.trim() || 'New Chat';
    return res.status(200).json({ title });
  } catch (error) {
    console.error('Error generating title:', error);
    const fallback = prompt.split(' ').slice(0, 6).join(' ');
    return res.status(200).json({ title: fallback + (prompt.split(' ').length > 6 ? '...' : '') });
  }
}
