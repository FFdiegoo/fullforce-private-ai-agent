import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabaseClient';
import { EnhancedDocumentProcessor } from '../../lib/document-processor-enhanced';
import { auditLogger } from '../../lib/enhanced-audit-logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verify authentication
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

    if (req.method === 'GET') {
      // Get RAG pipeline status and statistics
      try {
        // Get document statistics
        const { data: docStats, error: docStatsError } = await supabase
          .from('documents_metadata')
          .select('filename, processed, ready_for_indexing, mime_type, file_size, chunk_count')
          .order('last_updated', { ascending: false });

        if (docStatsError) {
          throw new Error(`Failed to fetch document stats: ${docStatsError.message}`);
        }

        // Get chunk statistics
        const { data: chunkStats, error: chunkStatsError } = await supabase
          .from('document_chunks')
          .select('id, created_at')
          .order('created_at', { ascending: false })
          .limit(1000);

        if (chunkStatsError) {
          throw new Error(`Failed to fetch chunk stats: ${chunkStatsError.message}`);
        }

        // Calculate statistics
        const totalDocuments = docStats?.length || 0;
        const processedDocuments = docStats?.filter(d => d.processed).length || 0;
        const readyForIndexing = docStats?.filter(d => d.ready_for_indexing && !d.processed).length || 0;
        const totalChunks = chunkStats?.length || 0;
        const totalFileSize = docStats?.reduce((sum, doc) => sum + (doc.file_size || 0), 0) || 0;
        const avgChunksPerDoc = processedDocuments > 0 ? Math.round(totalChunks / processedDocuments) : 0;

        // File type distribution
        const fileTypes = docStats?.reduce((acc: any, doc) => {
          const type = doc.mime_type || 'unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {}) || {};

        // Recent activity
        const recentDocuments = docStats?.slice(0, 10).map(doc => ({
          filename: doc.filename || 'Unknown',
          processed: doc.processed,
          ready_for_indexing: doc.ready_for_indexing,
          chunk_count: doc.chunk_count || 0,
          file_size: doc.file_size || 0,
          mime_type: doc.mime_type || 'unknown'
        })) || [];

        await auditLogger.logAdmin('RAG_PIPELINE_STATUS_ACCESSED', user.id, undefined, {
          totalDocuments,
          processedDocuments,
          totalChunks
        });

        return res.status(200).json({
          pipeline_status: 'operational',
          timestamp: new Date().toISOString(),
          statistics: {
            documents: {
              total: totalDocuments,
              processed: processedDocuments,
              ready_for_indexing: readyForIndexing,
              processing_rate: totalDocuments > 0 ? Math.round((processedDocuments / totalDocuments) * 100) : 0
            },
            chunks: {
              total: totalChunks,
              average_per_document: avgChunksPerDoc
            },
            storage: {
              total_file_size_bytes: totalFileSize,
              total_file_size_mb: Math.round(totalFileSize / 1024 / 1024 * 100) / 100
            },
            file_types: fileTypes
          },
          recent_activity: recentDocuments,
          configuration: {
            chunk_size: 1000,
            chunk_overlap: 200,
            embedding_model: 'text-embedding-3-small',
            similarity_threshold: 0.7,
            max_context_tokens: 4000
          }
        });

      } catch (error) {
        console.error('RAG pipeline status error:', error);
        return res.status(500).json({
          pipeline_status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

    } else if (req.method === 'POST') {
      // Test RAG pipeline functionality
      try {
        const { test_query = 'test search query', test_type = 'full' } = req.body;

        console.log(`🧪 Testing RAG pipeline with query: "${test_query}"`);

        // Validate environment variables
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.OPENAI_API_KEY) {
          return res.status(500).json({ 
            error: 'Missing required environment variables',
            required: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY']
          });
        }

        // Initialize processor for testing
        const processor = new EnhancedDocumentProcessor(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          process.env.OPENAI_API_KEY
        );

        const testResults: any = {
          query: test_query,
          test_type,
          timestamp: new Date().toISOString(),
          tests: {}
        };

        // Test 1: Vector search functionality
        try {
          console.log('🔍 Testing vector search...');
          const searchResults = await processor.testVectorSearch(test_query, 5);
          testResults.tests.vector_search = {
            status: 'success',
            results_found: searchResults.length,
            results: searchResults.map(result => ({
              similarity: result.similarity,
              content_preview: result.content?.substring(0, 100) + '...',
              metadata: result.metadata
            }))
          };
        } catch (searchError) {
          testResults.tests.vector_search = {
            status: 'failed',
            error: searchError instanceof Error ? searchError.message : 'Unknown error'
          };
        }

        // Test 2: Document processing status
        try {
          console.log('📊 Testing document processing status...');
          const unprocessedDocs = await processor.getUnprocessedDocuments(5);
          testResults.tests.document_processing = {
            status: 'success',
            unprocessed_documents: unprocessedDocs.length,
            documents: unprocessedDocs.map(doc => ({
              id: doc.id,
              filename: doc.filename,
              file_size: doc.file_size,
              ready_for_indexing: doc.ready_for_indexing
            }))
          };
        } catch (processingError) {
          testResults.tests.document_processing = {
            status: 'failed',
            error: processingError instanceof Error ? processingError.message : 'Unknown error'
          };
        }

        // Test 3: Database connectivity
        try {
          console.log('🔗 Testing database connectivity...');
          const { data: dbTest, error: dbError } = await supabase
            .from('document_chunks')
            .select('id')
            .limit(1);

          if (dbError) throw dbError;

          testResults.tests.database_connectivity = {
            status: 'success',
            connection: 'ok'
          };
        } catch (dbError) {
          testResults.tests.database_connectivity = {
            status: 'failed',
            error: dbError instanceof Error ? dbError.message : 'Unknown error'
          };
        }

        // Test 4: OpenAI API connectivity
        try {
          console.log('🤖 Testing OpenAI API connectivity...');
          const testEmbedding = await processor.generateEmbedding('test');
          testResults.tests.openai_connectivity = {
            status: 'success',
            embedding_dimensions: testEmbedding.length,
            api_response: 'ok'
          };
        } catch (openaiError) {
          testResults.tests.openai_connectivity = {
            status: 'failed',
            error: openaiError instanceof Error ? openaiError.message : 'Unknown error'
          };
        }

        // Overall health assessment
        const failedTests = Object.values(testResults.tests).filter((test: any) => test.status === 'failed').length;
        const totalTests = Object.keys(testResults.tests).length;
        
        testResults.overall_health = {
          status: failedTests === 0 ? 'healthy' : failedTests < totalTests ? 'degraded' : 'unhealthy',
          passed_tests: totalTests - failedTests,
          total_tests: totalTests,
          health_score: Math.round(((totalTests - failedTests) / totalTests) * 100)
        };

        await auditLogger.logAdmin('RAG_PIPELINE_TESTED', user.id, undefined, {
          testQuery: test_query,
          healthScore: testResults.overall_health.health_score,
          failedTests
        });

        return res.status(200).json(testResults);

      } catch (error) {
        console.error('RAG pipeline test error:', error);
        await auditLogger.logError(error as Error, 'RAG_PIPELINE_TEST');
        
        return res.status(500).json({
          error: 'RAG pipeline test failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('RAG pipeline API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}