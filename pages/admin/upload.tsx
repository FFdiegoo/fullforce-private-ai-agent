import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { format } from 'date-fns';

interface Document {
  id: string;
  filename: string;
  safe_filename: string;
  file_size: number;
  mime_type: string;
  afdeling: string;
  categorie: string;
  uploaded_by: string;
  upload_date: string;
  processed: boolean;
  ready_for_indexing: boolean;
  chunk_count?: number;
  embedding_status: string;
  last_error?: string;
}

interface UploadStats {
  totalDocuments: number;
  pendingApproval: number;
  readyForProcessing: number;
  processed: number;
  failed: number;
  totalSize: number;
  averageProcessingTime: number;
}

export default function AdminUpload() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [stats, setStats] = useState<UploadStats>({
    totalDocuments: 0,
    pendingApproval: 0,
    readyForProcessing: 0,
    processed: 0,
    failed: 0,
    totalSize: 0,
    averageProcessingTime: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<'approve' | 'reject' | 'reprocess' | ''>('');
  const [processingBulk, setProcessingBulk] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'processed' | 'failed'>('all');

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

      await fetchData();
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/login');
    }
  }

  async function fetchData() {
    try {
      // Fetch all documents
      const { data: docsData, error: docsError } = await supabase
        .from('documents_metadata')
        .select('*')
        .order('upload_date', { ascending: false });

      if (docsError) {
        console.error('Error fetching documents:', docsError);
        return;
      }

      const documents = docsData || [];
      setDocuments(documents);

      // Calculate statistics
      const totalDocuments = documents.length;
      const pendingApproval = documents.filter(d => !d.ready_for_indexing).length;
      const readyForProcessing = documents.filter(d => d.ready_for_indexing && !d.processed).length;
      const processed = documents.filter(d => d.processed).length;
      const failed = documents.filter(d => d.last_error).length;
      const totalSize = documents.reduce((sum, d) => sum + (d.file_size || 0), 0);

      setStats({
        totalDocuments,
        pendingApproval,
        readyForProcessing,
        processed,
        failed,
        totalSize,
        averageProcessingTime: 0 // TODO: Calculate from processing logs
      });

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDocumentAction(documentId: string, action: 'approve' | 'reject' | 'reprocess') {
    try {
      const document = documents.find(d => d.id === documentId);
      if (!document) return;

      if (action === 'approve') {
        const { error } = await supabase
          .from('documents_metadata')
          .update({ 
            ready_for_indexing: true,
            last_error: null,
            last_updated: new Date().toISOString()
          })
          .eq('id', documentId);

        if (error) throw error;

        // Trigger processing
        await triggerDocumentProcessing(documentId);

      } else if (action === 'reject') {
        if (!confirm(`Delete document "${document.filename}"? This action cannot be undone.`)) {
          return;
        }

        // Delete from storage
        await supabaseAdmin.storage
          .from('company-docs')
          .remove([document.storage_path]);

        // Delete from database
        const { error } = await supabase
          .from('documents_metadata')
          .delete()
          .eq('id', documentId);

        if (error) throw error;

      } else if (action === 'reprocess') {
        const { error } = await supabase
          .from('documents_metadata')
          .update({ 
            processed: false,
            embedding_status: 'PENDING',
            last_error: null,
            chunk_count: 0,
            processed_date: null,
            last_updated: new Date().toISOString()
          })
          .eq('id', documentId);

        if (error) throw error;

        // Trigger reprocessing
        await triggerDocumentProcessing(documentId);
      }

      await fetchData(); // Refresh data
      
    } catch (error) {
      console.error('Document action error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function triggerDocumentProcessing(documentId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/ingest-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ document_id: documentId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Processing trigger failed');
      }

      console.log('Document processing triggered successfully');
    } catch (error) {
      console.error('Error triggering processing:', error);
    }
  }

  async function handleBulkAction() {
    if (!bulkAction || selectedDocuments.length === 0) return;

    if (!confirm(`${bulkAction.toUpperCase()} ${selectedDocuments.length} selected documents?`)) {
      return;
    }

    setProcessingBulk(true);

    try {
      for (const documentId of selectedDocuments) {
        await handleDocumentAction(documentId, bulkAction);
      }

      setSelectedDocuments([]);
      setBulkAction('');
      
    } catch (error) {
      console.error('Bulk action error:', error);
      alert('Some bulk operations failed. Check the console for details.');
    } finally {
      setProcessingBulk(false);
    }
  }

  const toggleDocumentSelection = (documentId: string) => {
    setSelectedDocuments(prev => 
      prev.includes(documentId)
        ? prev.filter(id => id !== documentId)
        : [...prev, documentId]
    );
  };

  const selectAllDocuments = () => {
    const filteredDocs = getFilteredDocuments();
    const allSelected = filteredDocs.every(doc => selectedDocuments.includes(doc.id));
    
    if (allSelected) {
      setSelectedDocuments([]);
    } else {
      setSelectedDocuments(filteredDocs.map(doc => doc.id));
    }
  };

  const getFilteredDocuments = () => {
    switch (filter) {
      case 'pending':
        return documents.filter(d => !d.ready_for_indexing);
      case 'approved':
        return documents.filter(d => d.ready_for_indexing && !d.processed);
      case 'processed':
        return documents.filter(d => d.processed);
      case 'failed':
        return documents.filter(d => d.last_error);
      default:
        return documents;
    }
  };

  const getStatusBadge = (doc: Document) => {
    if (doc.last_error) {
      return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">❌ Failed</span>;
    }
    if (doc.processed) {
      return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">✅ Processed</span>;
    }
    if (doc.ready_for_indexing) {
      return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">🔄 Ready</span>;
    }
    return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">⏳ Pending</span>;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading upload management...</p>
        </div>
      </div>
    );
  }

  const filteredDocuments = getFilteredDocuments();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Upload Management</h1>
            <p className="text-gray-600 mt-1">Manage document uploads and processing</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => router.push('/upload-and-process')}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              📤 Upload Documents
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
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{stats.totalDocuments}</div>
            <div className="text-sm text-gray-600">Total Documents</div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.pendingApproval}</div>
            <div className="text-sm text-gray-600">Pending Approval</div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.readyForProcessing}</div>
            <div className="text-sm text-gray-600">Ready for Processing</div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-green-600">{stats.processed}</div>
            <div className="text-sm text-gray-600">Processed</div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-sm text-gray-600">Failed</div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="text-2xl font-bold text-purple-600">{formatFileSize(stats.totalSize)}</div>
            <div className="text-sm text-gray-600">Total Size</div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            {/* Filters */}
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">Filter:</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Documents ({documents.length})</option>
                <option value="pending">Pending Approval ({stats.pendingApproval})</option>
                <option value="approved">Ready for Processing ({stats.readyForProcessing})</option>
                <option value="processed">Processed ({stats.processed})</option>
                <option value="failed">Failed ({stats.failed})</option>
              </select>
            </div>

            {/* Bulk Actions */}
            {selectedDocuments.length > 0 && (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">
                  {selectedDocuments.length} selected
                </span>
                <select
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select Action</option>
                  <option value="approve">Approve for Processing</option>
                  <option value="reject">Delete Documents</option>
                  <option value="reprocess">Reprocess</option>
                </select>
                <button
                  onClick={handleBulkAction}
                  disabled={!bulkAction || processingBulk}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processingBulk ? 'Processing...' : 'Apply'}
                </button>
              </div>
            )}

            {/* Select All */}
            <button
              onClick={selectAllDocuments}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              {filteredDocuments.every(doc => selectedDocuments.includes(doc.id)) ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        </div>

        {/* Documents Table */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Documents ({filteredDocuments.length})
            </h3>
          </div>

          {filteredDocuments.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📄</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No documents found</h3>
              <p className="text-gray-600 mb-6">
                {filter === 'all' 
                  ? 'No documents have been uploaded yet.'
                  : `No documents match the "${filter}" filter.`
                }
              </p>
              <button
                onClick={() => router.push('/upload-and-process')}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Upload Documents
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={filteredDocuments.length > 0 && filteredDocuments.every(doc => selectedDocuments.includes(doc.id))}
                        onChange={selectAllDocuments}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Document
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Uploaded
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredDocuments.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedDocuments.includes(doc.id)}
                          onChange={() => toggleDocumentSelection(doc.id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mr-3">
                            <span className="text-lg">
                              {doc.mime_type?.includes('pdf') ? '📄' :
                               doc.mime_type?.includes('word') ? '📝' :
                               doc.mime_type?.includes('excel') ? '📊' :
                               doc.mime_type?.includes('image') ? '🖼️' : '📄'}
                            </span>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900 max-w-xs truncate">
                              {doc.filename}
                            </div>
                            <div className="text-sm text-gray-500">
                              {formatFileSize(doc.file_size)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          <div><strong>Department:</strong> {doc.afdeling}</div>
                          <div><strong>Category:</strong> {doc.categorie}</div>
                          <div><strong>Uploaded by:</strong> {doc.uploaded_by}</div>
                          {doc.chunk_count && (
                            <div><strong>Chunks:</strong> {doc.chunk_count}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {getStatusBadge(doc)}
                          {doc.last_error && (
                            <div className="text-xs text-red-600 bg-red-50 p-2 rounded max-w-xs">
                              {doc.last_error}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {format(new Date(doc.upload_date), 'dd-MM-yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                          {!doc.ready_for_indexing && (
                            <button
                              onClick={() => handleDocumentAction(doc.id, 'approve')}
                              className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                              title="Approve for processing"
                            >
                              ✅ Approve
                            </button>
                          )}
                          {doc.last_error && (
                            <button
                              onClick={() => handleDocumentAction(doc.id, 'reprocess')}
                              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                              title="Reprocess document"
                            >
                              🔄 Retry
                            </button>
                          )}
                          <button
                            onClick={() => handleDocumentAction(doc.id, 'reject')}
                            className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                            title="Delete document"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}