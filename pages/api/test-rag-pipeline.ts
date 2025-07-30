import { NextApiRequest, NextApiResponse } from 'next';
import { DocumentService } from '../../lib/database/documents';
import { EmbeddingStatus } from '../../lib/types/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Get RAG pipeline status
    try {
      const stats = await DocumentService.getProcessingStats();
      const searchableDocuments = await DocumentService.getSearchableDocuments();
      
      res.status(200).json({
        pipeline_status: 'operational',
        statistics: stats,
        searchable_documents: searchableDocuments.length,
        documents: searchableDocuments.map(doc => ({
          id: doc.id,
          filename: doc.filename,
          safe_filename: doc.safe_filename,
          file_size: doc.file_size,
          content_type: doc.content_type,
          upload_date: doc.upload_date,
          processed_date: doc.processed_date,
          embedding_status: doc.embedding_status,
          chunk_count: doc.chunk_count,
        })),
        last_updated: new Date(),
      });
    } catch (error) {
      console.error('RAG pipeline test error:', error);
      res.status(500).json({
        pipeline_status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } else if (req.method === 'POST') {
    // Test RAG pipeline with a query
    try {
      const { test_query = 'test search query' } = req.body;
      
      // Test document search
      const searchResults = await DocumentService.searchChunks(test_query, 5);
      
      // Test document processing status
      const stats = await DocumentService.getProcessingStats();
      
      res.status(200).json({
        test_results: {
          query: test_query,
          results_found: searchResults.length,
          search_results: searchResults.map(chunk => ({
            document_id: chunk.document_id,
            chunk_index: chunk.chunk_index,
            content_preview: chunk.content.slice(0, 100) + '...',
            document_info: chunk.document ? {
              filename: chunk.document.filename,
              content_type: chunk.document.content_type,
            } : null,
          })),
        },
        pipeline_health: {
          database_connection: 'ok',
          document_processing: stats.completed > 0 ? 'ok' : 'no_documents',
          search_functionality: searchResults.length > 0 ? 'ok' : 'no_results',
          overall_status: 'operational',
        },
        statistics: stats,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('RAG pipeline test error:', error);
      res.status(500).json({
        test_results: null,
        pipeline_health: {
          database_connection: 'error',
          overall_status: 'failed',
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}