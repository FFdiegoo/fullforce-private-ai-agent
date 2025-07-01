import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get document ID from query parameters
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Document ID is required' });
    }

    // Get document status from database
    const { data, error } = await supabaseAdmin
      .from('documents_metadata')
      .select('id, filename, processed, processed_at, ready_for_indexing')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Get chunk count for this document
    const { count, error: countError } = await supabaseAdmin
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('metadata->>id', id);

    if (countError) {
      console.error('Error getting chunk count:', countError);
    }

    // Return document status
    return res.status(200).json({
      id: data.id,
      filename: data.filename,
      processed: data.processed,
      processedAt: data.processed_at,
      readyForIndexing: data.ready_for_indexing,
      chunkCount: count || 0,
      status: data.processed ? 'completed' : data.ready_for_indexing ? 'ready' : 'pending',
    });
  } catch (error: any) {
    console.error('Error checking processing status:', error);
    return res.status(500).json({
      error: 'Failed to check processing status',
      details: error.message,
    });
  }
}