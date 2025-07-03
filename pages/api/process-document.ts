// pages/api/process-document.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { RAGPipeline } from '@/lib/rag/pipeline';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { openaiApiKey, RAG_CONFIG } from '@/lib/rag/config';
import { DocumentMetadata } from '@/lib/rag/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get document ID from request body
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Document ID is required' });
  }

  try {
    // Check if environment variables are properly loaded
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.OPENAI_API_KEY) {
      throw new Error('Missing required environment variables');
    }

    console.log(`🔍 Processing document with ID: ${id}`);

    // Fetch the complete document metadata using supabaseAdmin
    const { data: document, error: fetchError } = await supabaseAdmin
      .from('documents_metadata')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !document) {
      console.error('❌ Error fetching document metadata:', fetchError?.message || 'Document not found');
      return res.status(404).json({ 
        error: 'Document not found', 
        details: fetchError?.message || 'Could not find document with the provided ID' 
      });
    }

    console.log(`✅ Found document: ${document.filename}`);

    // Create RAG pipeline with supabaseAdmin for proper permissions
    const pipeline = new RAGPipeline(supabaseAdmin, openaiApiKey);

    // Process the document with the complete metadata
    await pipeline.processDocument(document as DocumentMetadata, {
      chunkSize: RAG_CONFIG.chunkSize,
      chunkOverlap: RAG_CONFIG.chunkOverlap,
      skipExisting: false,
    });

    // Update document status to processed
    await supabaseAdmin
      .from('documents_metadata')
      .update({
        processed: true,
        processed_at: new Date().toISOString()
      })
      .eq('id', id);

    console.log(`✅ Document processed successfully: ${document.filename}`);

    return res.status(200).json({ 
      success: true,
      message: `Document ${document.filename} processed successfully`
    });
  } catch (error: any) {
    console.error('❌ Error processing document:', error);
    return res.status(500).json({ 
      error: 'Failed to process document', 
      details: error.message 
    });
  }
}