import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/useAuth';

interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
  preview?: string;
  documentId?: string;
  eta?: string;
  speed?: string;
}

interface UploadStats {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  totalSize: number;
  uploadedSize: number;
  averageSpeed: number;
}

export default function UploadAndProcess() {
  const router = useRouter();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [stats, setStats] = useState<UploadStats>({
    totalFiles: 0,
    completedFiles: 0,
    failedFiles: 0,
    totalSize: 0,
    uploadedSize: 0,
    averageSpeed: 0
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Supported file types with icons
  const supportedTypes = {
    'application/pdf': { icon: '📄', name: 'PDF' },
    'application/msword': { icon: '📝', name: 'Word' },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: '📝', name: 'Word' },
    'text/plain': { icon: '📄', name: 'Text' },
    'text/csv': { icon: '📊', name: 'CSV' },
    'application/vnd.ms-excel': { icon: '📊', name: 'Excel' },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { icon: '📊', name: 'Excel' },
    'image/jpeg': { icon: '🖼️', name: 'Image' },
    'image/png': { icon: '🖼️', name: 'Image' },
    'image/gif': { icon: '🖼️', name: 'Image' }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFileSelection(droppedFiles);
  }, []);

  // File selection handler
  const handleFileSelection = (selectedFiles: File[]) => {
    const newFiles: UploadFile[] = selectedFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
      file,
      status: 'pending',
      progress: 0,
      preview: generatePreview(file)
    }));

    // Validate files
    const validatedFiles = newFiles.map(uploadFile => {
      const validation = validateFile(uploadFile.file);
      if (!validation.valid) {
        return { ...uploadFile, status: 'error' as const, error: validation.error };
      }
      return uploadFile;
    });

    setFiles(prev => [...prev, ...validatedFiles]);
    updateStats([...files, ...validatedFiles]);
  };

  // File validation
  const validateFile = (file: File): { valid: boolean; error?: string } => {
    const maxSize = 1024 * 1024 * 1024; // 1GB
    const supportedTypesList = Object.keys(supportedTypes);

    if (!supportedTypesList.includes(file.type)) {
      return { valid: false, error: `Unsupported file type: ${file.type}` };
    }

    if (file.size > maxSize) {
      return { valid: false, error: `File too large: ${formatFileSize(file.size)} (max: ${formatFileSize(maxSize)})` };
    }

    // Check for duplicates
    const isDuplicate = files.some(f => f.file.name === file.name && f.file.size === file.size);
    if (isDuplicate) {
      return { valid: false, error: 'Duplicate file detected' };
    }

    return { valid: true };
  };

  // Generate file preview
  const generatePreview = (file: File): string => {
    const typeInfo = supportedTypes[file.type as keyof typeof supportedTypes];
    return typeInfo?.icon || '📄';
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Update statistics
  const updateStats = (fileList: UploadFile[]) => {
    const totalFiles = fileList.length;
    const completedFiles = fileList.filter(f => f.status === 'completed').length;
    const failedFiles = fileList.filter(f => f.status === 'error').length;
    const totalSize = fileList.reduce((sum, f) => sum + f.file.size, 0);
    const uploadedSize = fileList.reduce((sum, f) => {
      if (f.status === 'completed') return sum + f.file.size;
      if (f.status === 'uploading') return sum + (f.file.size * f.progress / 100);
      return sum;
    }, 0);

    setStats({
      totalFiles,
      completedFiles,
      failedFiles,
      totalSize,
      uploadedSize,
      averageSpeed: 0 // Will be calculated during upload
    });
  };

  // Upload single file
  const uploadFile = async (uploadFile: UploadFile): Promise<void> => {
    const startTime = Date.now();
    let lastLoaded = 0;

    try {
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'uploading', progress: 0 }
          : f
      ));

      // Get auth session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No valid session');

      // Create FormData
      const formData = new FormData();
      formData.append('file', uploadFile.file);
      formData.append('department', 'Upload Interface');
      formData.append('category', 'User Upload');
      formData.append('subject', uploadFile.file.name);

      // Upload with progress tracking
      const xhr = new XMLHttpRequest();

      return new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            const currentTime = Date.now();
            const elapsed = (currentTime - startTime) / 1000;
            const speed = e.loaded / elapsed; // bytes per second
            const remaining = e.total - e.loaded;
            const eta = remaining / speed;

            setFiles(prev => prev.map(f => 
              f.id === uploadFile.id 
                ? { 
                    ...f, 
                    progress,
                    speed: formatSpeed(speed),
                    eta: formatETA(eta)
                  }
                : f
            ));

            lastLoaded = e.loaded;
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            setFiles(prev => prev.map(f => 
              f.id === uploadFile.id 
                ? { 
                    ...f, 
                    status: 'processing',
                    progress: 100,
                    documentId: response.document?.id
                  }
                : f
            ));

            // Simulate processing time
            setTimeout(() => {
              setFiles(prev => prev.map(f => 
                f.id === uploadFile.id 
                  ? { ...f, status: 'completed' }
                  : f
              ));
              resolve();
            }, 2000);
          } else {
            const errorResponse = JSON.parse(xhr.responseText);
            throw new Error(errorResponse.error || 'Upload failed');
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.open('POST', '/api/upload-document');
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
        xhr.send(formData);
      });

    } catch (error) {
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { 
              ...f, 
              status: 'error',
              error: error instanceof Error ? error.message : 'Upload failed'
            }
          : f
      ));
      throw error;
    }
  };

  // Upload all pending files
  const uploadAllFiles = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    try {
      // Upload files with concurrency limit (max 3 concurrent uploads)
      const concurrencyLimit = 3;
      const chunks = [];
      for (let i = 0; i < pendingFiles.length; i += concurrencyLimit) {
        chunks.push(pendingFiles.slice(i, i + concurrencyLimit));
      }

      for (const chunk of chunks) {
        await Promise.allSettled(chunk.map(uploadFile));
      }
    } catch (error) {
      console.error('Batch upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  // Remove file from queue
  const removeFile = (fileId: string) => {
    setFiles(prev => {
      const newFiles = prev.filter(f => f.id !== fileId);
      updateStats(newFiles);
      return newFiles;
    });
  };

  // Retry failed upload
  const retryUpload = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    setFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, status: 'pending', error: undefined, progress: 0 }
        : f
    ));

    await uploadFile(file);
  };

  // Clear all files
  const clearAllFiles = () => {
    setFiles([]);
    updateStats([]);
  };

  // Format speed
  const formatSpeed = (bytesPerSecond: number): string => {
    const mbps = bytesPerSecond / (1024 * 1024);
    return `${mbps.toFixed(1)} MB/s`;
  };

  // Format ETA
  const formatETA = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Get status icon
  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'uploading': return '📤';
      case 'processing': return '⚙️';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '📄';
    }
  };

  // Get status color
  const getStatusColor = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending': return 'text-gray-600 bg-gray-100';
      case 'uploading': return 'text-blue-600 bg-blue-100';
      case 'processing': return 'text-yellow-600 bg-yellow-100';
      case 'completed': return 'text-green-600 bg-green-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const pendingFiles = files.filter(f => f.status === 'pending');
  const hasValidFiles = pendingFiles.length > 0;
  const overallProgress = stats.totalSize > 0 ? Math.round((stats.uploadedSize / stats.totalSize) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Document Upload Center
            </h1>
            <p className="text-gray-600 mt-1">Upload documents for AI processing and knowledge base</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => router.push('/admin')}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Admin Dashboard
            </button>
            <button
              onClick={() => router.push('/select-assistant')}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Back to Chat
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Upload Statistics */}
        {files.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-white rounded-xl shadow-lg p-4">
              <div className="text-2xl font-bold text-gray-900">{stats.totalFiles}</div>
              <div className="text-sm text-gray-600">Total Files</div>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-4">
              <div className="text-2xl font-bold text-green-600">{stats.completedFiles}</div>
              <div className="text-sm text-gray-600">Completed</div>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-4">
              <div className="text-2xl font-bold text-red-600">{stats.failedFiles}</div>
              <div className="text-sm text-gray-600">Failed</div>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-4">
              <div className="text-2xl font-bold text-blue-600">{formatFileSize(stats.totalSize)}</div>
              <div className="text-sm text-gray-600">Total Size</div>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-4">
              <div className="text-2xl font-bold text-purple-600">{overallProgress}%</div>
              <div className="text-sm text-gray-600">Progress</div>
            </div>
          </div>
        )}

        {/* Overall Progress Bar */}
        {isUploading && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Overall Progress</h3>
              <span className="text-sm text-gray-600">{overallProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-gradient-to-r from-indigo-600 to-purple-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>{formatFileSize(stats.uploadedSize)} / {formatFileSize(stats.totalSize)}</span>
              <span>{stats.completedFiles} / {stats.totalFiles} files</span>
            </div>
          </div>
        )}

        {/* Upload Zone */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={Object.keys(supportedTypes).join(',')}
            onChange={(e) => {
              if (e.target.files) {
                handleFileSelection(Array.from(e.target.files));
                e.target.value = '';
              }
            }}
            className="hidden"
          />

          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-2xl p-12 cursor-pointer transition-all duration-300
              ${isDragging 
                ? 'border-indigo-500 bg-indigo-50 scale-[1.02] shadow-lg' 
                : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
              }
              ${isUploading ? 'pointer-events-none opacity-75' : ''}
            `}
          >
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 text-gray-400 flex items-center justify-center">
                {isDragging ? (
                  <div className="text-4xl animate-bounce">📁</div>
                ) : (
                  <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                )}
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                {isDragging ? 'Drop files here' : 'Upload Documents'}
              </h3>
              
              <p className="text-gray-600 mb-6 text-lg">
                {isDragging 
                  ? 'Release to add files to upload queue'
                  : 'Drag & drop files here or click to browse'
                }
              </p>

              <div className="flex flex-wrap justify-center gap-2 mb-6">
                {Object.entries(supportedTypes).slice(0, 6).map(([type, info]) => (
                  <span key={type} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    <span className="mr-1">{info.icon}</span>
                    {info.name}
                  </span>
                ))}
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                  +more
                </span>
              </div>

              <div className="text-sm text-gray-500">
                Maximum file size: 1GB • Multiple files supported
              </div>
            </div>
          </div>
        </div>

        {/* File Queue */}
        {files.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900">
                Upload Queue ({files.length} files)
              </h3>
              <div className="flex space-x-3">
                {hasValidFiles && (
                  <button
                    onClick={uploadAllFiles}
                    disabled={isUploading}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isUploading ? 'Uploading...' : `Upload ${pendingFiles.length} Files`}
                  </button>
                )}
                <button
                  onClick={clearAllFiles}
                  disabled={isUploading}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto">
              {files.map((uploadFile) => (
                <div
                  key={uploadFile.id}
                  className="flex items-center p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                >
                  {/* File Preview */}
                  <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mr-4">
                    <span className="text-2xl">{uploadFile.preview}</span>
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {uploadFile.file.name}
                      </h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(uploadFile.status)}`}>
                        {getStatusIcon(uploadFile.status)} {uploadFile.status.toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                      <span>{formatFileSize(uploadFile.file.size)}</span>
                      {uploadFile.speed && uploadFile.eta && (
                        <span>{uploadFile.speed} • ETA: {uploadFile.eta}</span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {(uploadFile.status === 'uploading' || uploadFile.status === 'processing') && (
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                          className={`h-2 rounded-full transition-all duration-300 ${
                            uploadFile.status === 'uploading' 
                              ? 'bg-blue-500' 
                              : 'bg-yellow-500 animate-pulse'
                          }`}
                          style={{ width: `${uploadFile.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Error Message */}
                    {uploadFile.error && (
                      <div className="text-sm text-red-600 bg-red-50 p-2 rounded mt-2">
                        {uploadFile.error}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0 ml-4 flex space-x-2">
                    {uploadFile.status === 'error' && (
                      <button
                        onClick={() => retryUpload(uploadFile.id)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Retry upload"
                      >
                        🔄
                      </button>
                    )}
                    {uploadFile.status !== 'uploading' && uploadFile.status !== 'processing' && (
                      <button
                        onClick={() => removeFile(uploadFile.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove file"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mt-8">
          <h3 className="text-lg font-semibold text-blue-900 mb-4">📚 Upload Guidelines</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-blue-800 mb-2">Supported File Types</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>📄 PDF documents</li>
                <li>📝 Word documents (.doc, .docx)</li>
                <li>📊 Excel spreadsheets (.xls, .xlsx)</li>
                <li>📄 Text files (.txt, .csv)</li>
                <li>🖼️ Images (.jpg, .png, .gif)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-blue-800 mb-2">Best Practices</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Use descriptive filenames</li>
                <li>• Keep files under 100MB for best performance</li>
                <li>• Upload related documents together</li>
                <li>• Check for duplicates before uploading</li>
                <li>• Wait for processing to complete</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}