import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

interface DocumentUploaderProps {
  onUploadSuccess?: (documentId: string, filename: string) => void;
  onUploadError?: (error: string) => void;
  onProcessingStart?: (documentId: string) => void;
}

export default function DocumentUploader({
  onUploadSuccess,
  onUploadError,
  onProcessingStart,
}: DocumentUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [metadata, setMetadata] = useState({
    department: '',
    category: '',
    subject: '',
    version: '1.0',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    
    // Auto-fill subject from filename if empty
    if (selectedFile && !metadata.subject) {
      const filename = selectedFile.name;
      const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
      setMetadata({
        ...metadata,
        subject: nameWithoutExt,
      });
    }
  };

  const handleUpload = async () => {
    if (!file) {
      onUploadError?.('Please select a file');
      return;
    }

    if (!metadata.department || !metadata.category) {
      onUploadError?.('Department and Category are required');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('department', metadata.department);
      formData.append('category', metadata.category);
      formData.append('subject', metadata.subject || file.name);
      formData.append('version', metadata.version);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        formData.append('uploadedBy', user.email);
      }

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 10;
        });
      }, 300);

      // Upload file
      const response = await fetch('/api/upload-document', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(95);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadProgress(100);

      // Start processing if successful
      if (data.success && data.documentId) {
        setIsProcessing(true);
        onProcessingStart?.(data.documentId);

        // Process the document
        const processResponse = await fetch('/api/process-document', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: data.documentId,
            filename: file.name,
            safe_filename: data.metadata?.filename,
            storage_path: `uploads/${data.metadata?.filename}`,
            file_size: file.size,
            mime_type: file.type,
            afdeling: metadata.department,
            categorie: metadata.category,
            onderwerp: metadata.subject,
            versie: metadata.version,
            uploaded_by: user?.email || 'unknown',
            last_updated: new Date().toISOString(),
          }),
        });

        if (!processResponse.ok) {
          const processError = await processResponse.json();
          console.warn('Document uploaded but processing failed:', processError);
          // Still consider it a success since the upload worked
        }

        setIsProcessing(false);
        onUploadSuccess?.(data.documentId, file.name);
      }

      // Reset form
      setFile(null);
      setMetadata({
        department: '',
        category: '',
        subject: '',
        version: '1.0',
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Upload error:', error);
      onUploadError?.(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Upload Document</h2>
      
      {/* File selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Document
        </label>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          accept=".pdf,.doc,.docx,.txt"
          disabled={isUploading || isProcessing}
        />
        {file && (
          <div className="mt-2 p-3 bg-gray-50 rounded-md">
            <p className="text-sm text-gray-700">
              <strong>Selected:</strong> {file.name}
            </p>
            <p className="text-sm text-gray-600">
              <strong>Size:</strong> {formatFileSize(file.size)}
            </p>
            <p className="text-sm text-gray-600">
              <strong>Type:</strong> {file.type || 'Unknown'}
            </p>
          </div>
        )}
      </div>

      {/* Metadata fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Department *
          </label>
          <input
            type="text"
            value={metadata.department}
            onChange={(e) => setMetadata({ ...metadata, department: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Technical"
            disabled={isUploading || isProcessing}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Category *
          </label>
          <input
            type="text"
            value={metadata.category}
            onChange={(e) => setMetadata({ ...metadata, category: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Manuals"
            disabled={isUploading || isProcessing}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Subject
          </label>
          <input
            type="text"
            value={metadata.subject}
            onChange={(e) => setMetadata({ ...metadata, subject: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Generator Operation"
            disabled={isUploading || isProcessing}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Version
          </label>
          <input
            type="text"
            value={metadata.version}
            onChange={(e) => setMetadata({ ...metadata, version: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., 1.0"
            disabled={isUploading || isProcessing}
          />
        </div>
      </div>

      {/* Progress bar */}
      {(isUploading || isProcessing) && (
        <div className="mb-4">
          <div className="flex justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">
              {isProcessing ? 'Processing...' : `Uploading... ${Math.round(uploadProgress)}%`}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{ width: `${isProcessing ? 100 : uploadProgress}%` }}
            ></div>
          </div>
          {isProcessing && (
            <p className="text-xs text-gray-500 mt-1">
              Extracting text, creating chunks, and generating embeddings...
            </p>
          )}
        </div>
      )}

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!file || isUploading || isProcessing || !metadata.department || !metadata.category}
        className={`w-full py-2 px-4 rounded-md text-white font-medium ${
          !file || isUploading || isProcessing || !metadata.department || !metadata.category
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {isUploading ? 'Uploading...' : isProcessing ? 'Processing...' : 'Upload Document'}
      </button>

      {/* File type info */}
      <div className="mt-4 text-xs text-gray-500">
        <p>Supported file types: PDF, Word documents, Text files</p>
        <p>Maximum file size: 50MB</p>
        <p>* Required fields</p>
      </div>
    </div>
  );
}