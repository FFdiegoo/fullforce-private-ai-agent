import { NextApiRequest, NextApiResponse } from 'next';
import { RAGPipeline } from '../../lib/rag/pipeline';
import { supabase, openaiApiKey, RAG_CONFIG } from '../../lib/rag/config';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { documentId } = req.body;

    if (!documentId) {
      return res.status(400).json({ error: 'Document ID is required' });
    }

    // Fetch document metadata
    const { data: metadata, error } = await supabase
      .from('documents_metadata')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error || !metadata) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Initialize and run the RAG pipeline
    const pipeline = new RAGPipeline(supabase, openaiApiKey);
    await pipeline.processDocument(metadata, RAG_CONFIG);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error processing document:', error);
    res.status(500).json({ error: 'Failed to process document' });
  }
}