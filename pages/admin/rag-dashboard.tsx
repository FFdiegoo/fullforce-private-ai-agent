import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

interface RAGStats {
  pipeline_status: string;
  statistics: {
    documents: {
      total: number;
      processed: number;
      ready_for_indexing: number;
      processing_rate: number;
    };
    chunks: {
      total: number;
      average_per_document: number;
    };
    storage: {
      total_file_size_bytes: number;
      total_file_size_mb: number;
    };
    file_types: Record<string, number>;
  };
  recent_activity: any[];
  configuration: {
    chunk_size: number;
    chunk_overlap: number;
    embedding_model: string;
    similarity_threshold: number;
    max_context_tokens: number;
  };
}

interface TestResults {
  overall_health: {
    status: string;
    passed_tests: number;
    total_tests: number;
    health_score: number;
  };
  tests: Record<string, any>;
}

export default function RAGDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [testQuery, setTestQuery] = useState('What is the technical specification?');
  const [error, setError] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('email', user.email)
        .single();

      if (!profile || profile.role !== 'admin') {
        router.push('/select-assistant');
        return;
      }

      await fetchRAGStats();
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/login');
    }
  }

  async function fetchRAGStats() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/test-rag-pipeline', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to fetch RAG stats');
      }
    } catch (error) {
      console.error('Error fetching RAG stats:', error);
      setError('Failed to fetch RAG statistics');
    } finally {
      setLoading(false);
    }
  }

  async function runRAGTest() {
    try {
      setTesting(true);
      setError('');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/test-rag-pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          test_query: testQuery,
          test_type: 'full'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setTestResults(data);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'RAG test failed');
      }
    } catch (error) {
      console.error('RAG test error:', error);
      setError('Failed to run RAG test');
    } finally {
      setTesting(false);
    }
  }

  async function processDocuments() {
    try {
      setProcessing(true);
      setError('');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/ingest-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          batch_size: 5
        })
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Batch processing complete: ${data.batch_results.successful}/${data.batch_results.processed} documents processed successfully`);
        await fetchRAGStats(); // Refresh stats
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Document processing failed');
      }
    } catch (error) {
      console.error('Document processing error:', error);
      setError('Failed to process documents');
    } finally {
      setProcessing(false);
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational':
      case 'healthy':
      case 'success':
        return 'text-green-600 bg-green-100';
      case 'degraded':
        return 'text-yellow-600 bg-yellow-100';
      case 'unhealthy':
      case 'failed':
      case 'error':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading RAG dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">RAG Pipeline Dashboard</h1>
            <p className="text-gray-600 mt-1">Monitor and test the Retrieval-Augmented Generation system</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={processDocuments}
              disabled={processing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {processing ? 'Processing...' : '🔄 Process Documents'}
            </button>
            <button
              onClick={() => router.push('/admin')}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Back to Admin
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600">{error}</p>
            <button
              onClick={() => setError('')}
              className="mt-2 text-sm text-red-700 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Pipeline Status */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Overall Status */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Pipeline Status</h2>
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(stats.pipeline_status)}`}>
                <span className="w-2 h-2 rounded-full bg-current mr-2"></span>
                {stats.pipeline_status.toUpperCase()}
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Processing Rate:</span>
                  <span className="font-medium">{stats.statistics.documents.processing_rate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Documents:</span>
                  <span className="font-medium">{stats.statistics.documents.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Chunks:</span>
                  <span className="font-medium">{stats.statistics.chunks.total}</span>
                </div>
              </div>
            </div>

            {/* Document Statistics */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Document Statistics</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Processed:</span>
                  <span className="text-green-600 font-medium">{stats.statistics.documents.processed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Ready for Processing:</span>
                  <span className="text-yellow-600 font-medium">{stats.statistics.documents.ready_for_indexing}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Avg Chunks/Doc:</span>
                  <span className="font-medium">{stats.statistics.chunks.average_per_document}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Total Size:</span>
                  <span className="font-medium">{stats.statistics.storage.total_file_size_mb} MB</span>
                </div>
              </div>
            </div>

            {/* Configuration */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Configuration</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Chunk Size:</span>
                  <span className="font-medium">{stats.configuration.chunk_size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Overlap:</span>
                  <span className="font-medium">{stats.configuration.chunk_overlap}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Model:</span>
                  <span className="font-medium">{stats.configuration.embedding_model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Threshold:</span>
                  <span className="font-medium">{stats.configuration.similarity_threshold}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Max Context:</span>
                  <span className="font-medium">{stats.configuration.max_context_tokens}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RAG Testing */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">RAG Pipeline Testing</h2>
          
          <div className="flex gap-4 mb-6">
            <input
              type="text"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter test query..."
            />
            <button
              onClick={runRAGTest}
              disabled={testing || !testQuery.trim()}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {testing ? 'Testing...' : '🧪 Run Test'}
            </button>
          </div>

          {testResults && (
            <div className="space-y-4">
              {/* Overall Health */}
              <div className={`p-4 rounded-lg ${getStatusColor(testResults.overall_health.status)}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    Overall Health: {testResults.overall_health.status.toUpperCase()}
                  </span>
                  <span className="text-sm">
                    {testResults.overall_health.passed_tests}/{testResults.overall_health.total_tests} tests passed 
                    ({testResults.overall_health.health_score}%)
                  </span>
                </div>
              </div>

              {/* Individual Test Results */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(testResults.tests).map(([testName, result]: [string, any]) => (
                  <div key={testName} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium capitalize">{testName.replace(/_/g, ' ')}</h3>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(result.status)}`}>
                        {result.status.toUpperCase()}
                      </span>
                    </div>
                    
                    {result.status === 'success' ? (
                      <div className="text-sm text-gray-600">
                        {testName === 'vector_search' && (
                          <p>Found {result.results_found} relevant chunks</p>
                        )}
                        {testName === 'document_processing' && (
                          <p>{result.unprocessed_documents} documents ready for processing</p>
                        )}
                        {testName === 'openai_connectivity' && (
                          <p>Embedding dimensions: {result.embedding_dimensions}</p>
                        )}
                        {testName === 'database_connectivity' && (
                          <p>Connection: {result.connection}</p>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-red-600">
                        Error: {result.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        {stats && stats.recent_activity.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Recent Documents</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Filename
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Chunks
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {stats.recent_activity.map((doc, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {doc.filename}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {doc.mime_type?.split('/')[1] || 'unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {Math.round(doc.file_size / 1024)} KB
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {doc.chunk_count || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          doc.processed 
                            ? 'bg-green-100 text-green-800'
                            : doc.ready_for_indexing
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {doc.processed ? 'Processed' : doc.ready_for_indexing ? 'Ready' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}