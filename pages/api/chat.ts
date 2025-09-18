import type { NextApiRequest, NextApiResponse } from 'next';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { supabaseAdmin } from '../../lib/server/supabaseAdmin';
import { getOrCreateSession } from '../../lib/chat/session';
import { RAGPipeline } from '../../lib/rag/pipeline';
import { RAG_CONFIG, openaiApiKey } from '../../lib/rag/config';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { message } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Missing message' });
      return;
    }

    // sessie
    const { sessionId } = await getOrCreateSession(req, res);

    // sla user-bericht alvast op
    await supabaseAdmin.from('chat_messages').insert({
      session_id: sessionId,
      role: 'user',
      content: message
    });

    // RAG retrieval
    const supabaseUserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const pipeline = new RAGPipeline(supabaseUserClient, openaiApiKey);
    const results = await pipeline.searchSimilarDocuments(message);

    // Bouw context string simpel (optioneel: limiteren)
    const contextText = (results || [])
      .map((r: any) => `• ${r.content || r.text || ''}`)
      .slice(0, RAG_CONFIG.maxResults)
      .join('\n');

    // Call LLM (hou je bestaande OpenAI call aan als die al in dit bestand staat)
    // Voorbeeld:
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'Je bent een behulpzame bedrijfsspecifieke assistent.' },
      { role: 'system', content: `Context uit documenten:\n${contextText || '(geen)'}\n` },
      { role: 'user', content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo',
      messages: prompt,
      temperature: 0.2
    });

    const answer = completion.choices?.[0]?.message?.content?.trim() || '...';

    // log bronnen (bewaar de topN resultaten, alleen de velden die we hebben)
    const sources = (results || []).slice(0, RAG_CONFIG.maxResults).map((r: any) => ({
      doc_id: r.doc_id || r.document_id || null,
      chunk_index: r.chunk_index ?? null,
      similarity: r.similarity ?? null
    }));

    // sla assistant-antwoord op
    await supabaseAdmin.from('chat_messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content: answer,
      sources
    });

    res.status(200).json({ answer, sources });
  } catch (error: any) {
    console.error('❌ Error in chat API:', error);
    res.status(500).json({ error: 'Internal error' });
  }
}
