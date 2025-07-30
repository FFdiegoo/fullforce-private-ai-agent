import { NextApiRequest, NextApiResponse } from 'next';
import { DocumentService } from '../../lib/database/documents';
import { EmbeddingStatus } from '../../lib/types/database';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, limit = 5, threshold = 0.7 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const relevantChunks = await DocumentService.searchChunks(query, limit, threshold);

    if (relevantChunks.length === 0) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. The user asked a question but no relevant documents were found in the knowledge base. Provide a helpful general response and suggest they might want to upload relevant documents.'
          },
          {
            role: 'user',
            content: query
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      return res.status(200).json({
        response: completion.choices[0]?.message?.content || 'I could not find relevant information in the knowledge base.',
        sources: [],
        context_used: false,
        documents_searched: 0,
      });
    }

    // Voorzie context van chunks — alleen data beschikbaar in chunk zelf
    const context = relevantChunks
      .map((chunk, index) => `[Document ${index + 1}]\n${chunk.content}`)
      .join('\n\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that answers questions based on the provided document context. Use the context to provide accurate, detailed answers. If the context doesn't contain enough information to answer the question, say so clearly.

Context from documents:
${context}`
        },
        {
          role: 'user',
          content: query
        }
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const sources = relevantChunks.map((chunk) => ({
      document_id: chunk.document_id,
      chunk_index: chunk.chunk_index,
      content_preview: chunk.content.slice(0, 200) + '...',
    }));

    res.status(200).json({
      response: completion.choices[0]?.message?.content || 'Unable to generate response.',
      sources,
      context_used: true,
      documents_searched: relevantChunks.length,
      query_processed: query,
    });

  } catch (error) {
    console.error('RAG chat error:', error);
    res.status(500).json({
      error: 'RAG chat failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
