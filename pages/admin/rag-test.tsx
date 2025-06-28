import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

interface TestDocument {
  id: string;
  filename: string;
  file_size: number;
  processed: boolean;
  created_at: string;
}

interface TestResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export default function RAGTestPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<TestDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [selectedDocument, setSelectedDocument] = useState<string>('');
  const [testQuery, setTestQuery] = useState('What is this document about?');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAuthAndFetch();
  }, []);

  async function checkAuthAndFetch() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Check admin status
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('email', session.user.email)
        .single();

      if (!profile || profile.role !== 'admin') {
        router.push('/select-assistant');
        return;
      }

      setIsAdmin(true);
      await fetchDocuments();
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/login');
    }
  }

  async function fetchDocuments() {
    try {
      const { data, error } = await supabase
        .from('documents_metadata')
        .select('id, filename, file_size, processed, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  }

  async function runTest(action: string, params: any = {}) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/test-rag-pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action, ...params })
      });

      const result = await response.json();
      
      setTestResults(prev => ({
        ...prev,
        [action]: result
      }));

      return result;
    } catch (error) {
      console.error(`Test ${action} error:`, error);
      setTestResults(prev => ({
        ...prev,
        [action]: {
          success: false,
          message: 'Test failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }));
    }
  }

  async function runAllTests() {
    if (!selectedDocument) {
      alert('Please select a document first');
      return;
    }

    console.log('🚀 Running comprehensive RAG tests...');

    // Test 1: Process Document
    await runTest('process_document', { documentId: selectedDocument });
    
    // Test 2: Test Embeddings Generation
    await runTest('test_embeddings');
    
    // Test 3: Verify Chunks Storage
    await runTest('verify_chunks', { documentId: selectedDocument });
    
    // Test 4: Test Vector Search
    await runTest('test_vector_search', { query: testQuery });
    
    // Test 5: Test AI Response
    await runTest('test_ai_response', { query: testQuery });

    console.log('✅ All RAG tests completed');
  }

  const getTestStatus = (testName: string) => {
    const result = testResults[testName];
    if (!result) return '⏳';
    return result.success ? '✅' : '❌';
  };

  const getTestMessage = (testName: string) => {
    const result = testResults[testName];
    if (!result) return 'Not run yet';
    return result.message;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading RAG test interface...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">RAG System Test</h1>
            <p className="text-gray-600 mt-1">Test document processing, embeddings, and AI responses</p>
          </div>
          <div className="flex space-x-3">
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
        {/* Test Configuration */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Test Configuration</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Test Document
              </label>
              <select
                value={selectedDocument}
                onChange={(e) => setSelectedDocument(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Choose a document...</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.filename} ({(doc.file_size / 1024).toFixed(1)} KB)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Test Query
              </label>
              <input
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter test query..."
              />
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={runAllTests}
              disabled={!selectedDocument}
              className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              🚀 Run All RAG Tests
            </button>
          </div>
        </div>

        {/* Test Results */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Test Status Overview */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Test Status</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">Document Processing</span>
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">{getTestStatus('process_document')}</span>
                  <button
                    onClick={() => runTest('process_document', { documentId: selectedDocument })}
                    disabled={!selectedDocument}
                    className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 disabled:opacity-50"
                  >
                    Test
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">Embeddings Generation</span>
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">{getTestStatus('test_embeddings')}</span>
                  <button
                    onClick={() => runTest('test_embeddings')}
                    className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                  >
                    Test
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">Chunks Storage</span>
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">{getTestStatus('verify_chunks')}</span>
                  <button
                    onClick={() => runTest('verify_chunks', { documentId: selectedDocument })}
                    disabled={!selectedDocument}
                    className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 disabled:opacity-50"
                  >
                    Test
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">Vector Search</span>
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">{getTestStatus('test_vector_search')}</span>
                  <button
                    onClick={() => runTest('test_vector_search', { query: testQuery })}
                    className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                  >
                    Test
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">AI Response</span>
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">{getTestStatus('test_ai_response')}</span>
                  <button
                    onClick={() => runTest('test_ai_response', { query: testQuery })}
                    className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                  >
                    Test
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Test Results Details */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Test Results</h2>
            
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {Object.entries(testResults).map(([testName, result]) => (
                <div key={testName} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium capitalize">
                      {testName.replace(/_/g, ' ')}
                    </h3>
                    <span className="text-2xl">
                      {result.success ? '✅' : '❌'}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-2">
                    {result.message}
                  </p>
                  
                  {result.error && (
                    <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                      Error: {result.error}
                    </p>
                  )}
                  
                  {result.data && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-blue-600">
                        View Details
                      </summary>
                      <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
              
              {Object.keys(testResults).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No test results yet. Run some tests to see results here.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Available Documents */}
        <div className="mt-8 bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Available Test Documents</h2>
          
          {documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No documents available for testing.</p>
              <p className="mt-2">Upload some documents via the admin interface first.</p>
              <button
                onClick={() => router.push('/admin/upload')}
                className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Go to Upload
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedDocument === doc.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedDocument(doc.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 truncate">
                        {doc.filename}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {(doc.file_size / 1024).toFixed(1)} KB
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="ml-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        doc.processed
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {doc.processed ? 'Processed' : 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}