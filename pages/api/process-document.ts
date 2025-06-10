// pages/api/process-document.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { RAGPipeline } from '@/lib/rag/pipeline';
import { supabase, openaiApiKey, RAG_CONFIG } from '@/lib/rag/config';
import { DocumentMetadata } from '@/lib/rag/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const metadata: DocumentMetadata = req.body;

  if (!metadata || !metadata.id) {
    return res.status(400).json({ error: 'Missing document metadata' });
  }

  try {
    const pipeline = new RAGPipeline(supabase, openaiApiKey);
  await pipeline.processDocument(metadata, {
  chunkSize: RAG_CONFIG.chunkSize,
  chunkOverlap: RAG_CONFIG.chunkOverlap, // Correct!
  skipExisting: false,
});


    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Error processing document:', error);
    return res.status(500).json({ error: 'Failed to process document', details: error.message });
  }
}
