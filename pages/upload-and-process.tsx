import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import DocumentUploader from '../components/DocumentUploader';

export default function UploadAndProcessPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [processingDocumentId, setProcessingDocumentId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    // Poll for processing status if we have a document ID
    if (processingDocumentId) {
      const interval = setInterval(checkProcessingStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [processingDocumentId]);

  async function checkAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Check if user is admin
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
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/login');
    }
  }

  async function checkProcessingStatus() {
    if (!processingDocumentId) return;

    try {
      const response = await fetch(`/api/check-processing-status?id=${processingDocumentId}`);
      const data = await response.json();

      if (!response.ok) {
        setError(`Error checking status: ${data.error}`);
        return;
      }

      if (data.processed) {
        setProcessingStatus(`Processing completed with ${data.chunkCount} chunks`);
        setSuccess(`Document "${data.filename}" has been successfully processed and is ready for AI queries!`);
        setProcessingDocumentId(null);
      } else {
        setProcessingStatus(`Processing in progress... (Status: ${data.status})`);
      }
    } catch (error) {
      console.error('Error checking processing status:', error);
      setError('Failed to check processing status');
    }
  }

  const handleUploadSuccess = (documentId: string, filename: string) => {
    setProcessingDocumentId(documentId);
    setProcessingStatus('Processing started...');
    setError(null);
    setSuccess(`Document "${filename}" uploaded successfully and processing has started.`);
  };

  const handleUploadError = (errorMessage: string) => {
    setError(`Upload failed: ${errorMessage}`);
    setSuccess(null);
  };

  const handleProcessingStart = (documentId: string) => {
    setProcessingDocumentId(documentId);
    setProcessingStatus('Processing started...');
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Checking authorization...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Document Upload & Processing
          </h1>
          <p className="mt-2 text-gray-600">
            Upload documents to be processed for AI retrieval
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-600">{success}</p>
            {processingStatus && (
              <p className="text-green-600 mt-2">{processingStatus}</p>
            )}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="p-6">
            <DocumentUploader
              onUploadSuccess={handleUploadSuccess}
              onUploadError={handleUploadError}
              onProcessingStart={handleProcessingStart}
            />
          </div>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Back to Admin Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}