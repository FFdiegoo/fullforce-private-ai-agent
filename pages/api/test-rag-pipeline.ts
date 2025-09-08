import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabaseClient';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { RAGPipeline } from '../../lib/rag/pipeline';
import { openaiApiKey, RAG_CONFIG } from '../../lib/rag/config';
import { applyEnhancedRateLimit } from '../../lib/enhanced-rate-limiter';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || '127.0.0.1';

  try {
    // Rate limiting
    const rateLimitResult = await applyEnhancedRateLimit(clientIP, 'admin');
    if (!rateLimitResult.success) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    // Verify admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('email', user.email)
      .single();

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { action, documentId, query } = req.body;

    switch (action) {
      case 'process_document':
        return await processTestDocument(documentId, res);
      
      case 'test_vector_search':
        return await testVectorSearch(query, res);
      
      case 'test_embeddings':
        return await testEmbeddingsGeneration(res);
      
      case 'verify_chunks':
        return await verifyChunksStorage(documentId, res);
      
      case 'test_ai_response':
        return await testAIResponse(query, res);
      
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('RAG pipeline test error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function processTestDocument(documentId: string, res: NextApiResponse) {
  try {
    console.log('🔄 Processing test document:', documentId);

    // Get document metadata
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents_metadata')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Initialize RAG pipeline
    const pipeline = new RAGPipeline(supabase, openaiApiKey);

    // Process the document
    await pipeline.processDocument(document, {
      chunkSize: RAG_CONFIG.chunkSize,
      chunkOverlap: RAG_CONFIG.chunkOverlap,
      skipExisting: false
    });

    // Verify chunks were created
    const { data: chunks, error: chunksError } = await supabaseAdmin
      .from('document_chunks')
      .select('id, chunk_index, content')
      .eq('metadata->id', documentId);

    if (chunksError) {
      throw chunksError;
    }

    return res.status(200).json({
      success: true,
      message: 'Document processed successfully',
      document: {
        id: document.id,
        filename: document.filename,
        fileSize: document.file_size
      },
      chunks: {
        count: chunks?.length || 0,
        samples: chunks?.slice(0, 3).map(chunk => ({
          index: chunk.chunk_index,
          preview: chunk.content.substring(0, 100) + '...'
        })) || []
      }
    });

  } catch (error) {
    console.error('Document processing error:', error);
    return res.status(500).json({
      error: 'Document processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function testVectorSearch(query: string, res: NextApiResponse) {
  try {
    console.log('🔍 Testing vector search with query:', query);

    // Generate embedding for the query
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Perform vector similarity search
    const { data: results, error } = await supabaseAdmin.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: 5
    });

    if (error) {
      // If the function doesn't exist, create a basic search
      console.log('Vector search function not found, using basic search');
      
      const { data: allChunks } = await supabaseAdmin
        .from('document_chunks')
        .select('*')
        .limit(10);

      return res.status(200).json({
        success: true,
        message: 'Basic search completed (vector function not available)',
        query,
        results: allChunks?.map(chunk => ({
          content: chunk.content.substring(0, 200) + '...',
          similarity: 'N/A',
          metadata: chunk.metadata
        })) || []
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Vector search completed',
      query,
      results: results?.map((result: any) => ({
        content: result.content.substring(0, 200) + '...',
        similarity: result.similarity,
        metadata: result.metadata
      })) || []
    });

  } catch (error) {
    console.error('Vector search error:', error);
    return res.status(500).json({
      error: 'Vector search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function testEmbeddingsGeneration(res: NextApiResponse) {
  try {
    console.log('🧠 Testing embeddings generation');

    const testText = "This is a test document for embedding generation.";
    
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: testText,
    });

    const embedding = embeddingResponse.data[0].embedding;

    return res.status(200).json({
      success: true,
      message: 'Embeddings generation test successful',
      test: {
        input: testText,
        embeddingDimensions: embedding.length,
        embeddingPreview: embedding.slice(0, 5),
        model: 'text-embedding-3-small'
      }
    });

  } catch (error) {
    console.error('Embeddings generation error:', error);
    return res.status(500).json({
      error: 'Embeddings generation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function verifyChunksStorage(documentId: string, res: NextApiResponse) {
  try {
    console.log('📊 Verifying chunks storage for document:', documentId);

    const { data: chunks, error } = await supabaseAdmin
      .from('document_chunks')
      .select('*')
      .eq('metadata->id', documentId)
      .order('chunk_index');

    if (error) {
      throw error;
    }

    const chunksWithEmbeddings = chunks?.filter(chunk => chunk.embedding) || [];
    const chunksWithoutEmbeddings = chunks?.filter(chunk => !chunk.embedding) || [];

    return res.status(200).json({
      success: true,
      message: 'Chunks verification completed',
      documentId,
      statistics: {
        totalChunks: chunks?.length || 0,
        chunksWithEmbeddings: chunksWithEmbeddings.length,
        chunksWithoutEmbeddings: chunksWithoutEmbeddings.length,
        averageChunkLength: chunks?.length ? 
          Math.round(chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length) : 0
      },
      samples: chunks?.slice(0, 3).map(chunk => ({
        index: chunk.chunk_index,
        contentLength: chunk.content.length,
        hasEmbedding: !!chunk.embedding,
        preview: chunk.content.substring(0, 150) + '...'
      })) || []
    });

  } catch (error) {
    console.error('Chunks verification error:', error);
    return res.status(500).json({
      error: 'Chunks verification failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function testAIResponse(query: string, res: NextApiResponse) {
  try {
    console.log('🤖 Testing AI response with RAG context');

    // Get relevant chunks (simplified version)
    const { data: chunks } = await supabaseAdmin
      .from('document_chunks')
      .select('content, metadata')
      .limit(3);

    const context = chunks?.map(chunk => chunk.content).join('\n\n') || '';

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant. Use the following context to answer questions: ${context}`
        },
        {
          role: 'user',
          content: query
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content || 'No response generated';

    return res.status(200).json({
      success: true,
      message: 'AI response test completed',
      test: {
        query,
        response,
        contextChunks: chunks?.length || 0,
        model: 'gpt-4-turbo'
      }
    });

  } catch (error) {
    console.error('AI response test error:', error);
    return res.status(500).json({
      error: 'AI response test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}