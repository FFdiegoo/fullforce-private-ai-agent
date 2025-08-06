import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
  documentId?: string;
  startTime?: number;
  speed?: number;
  eta?: number;
}

interface UploadOptions {
  maxConcurrent?: number;
  chunkSize?: number;
  retryAttempts?: number;
}

export function useUploadQueue(options: UploadOptions = {}) {
  const {
    maxConcurrent = 3,
    chunkSize = 1024 * 1024, // 1MB chunks
    retryAttempts = 3
  } = options;

  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const activeUploads = useRef(new Set<string>());
  const abortControllers = useRef(new Map<string, AbortController>());

  // Add files to queue
  const addFiles = useCallback((newFiles: File[]) => {
    const uploadFiles: UploadFile[] = newFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
      file,
      status: 'pending',
      progress: 0
    }));

    setFiles(prev => [...prev, ...uploadFiles]);
    return uploadFiles;
  }, []);

  // Remove file from queue
  const removeFile = useCallback((fileId: string) => {
    // Cancel upload if in progress
    const controller = abortControllers.current.get(fileId);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(fileId);
    }

    setFiles(prev => prev.filter(f => f.id !== fileId));
    activeUploads.current.delete(fileId);
  }, []);

  // Clear all files
  const clearAll = useCallback(() => {
    // Cancel all active uploads
    abortControllers.current.forEach(controller => controller.abort());
    abortControllers.current.clear();
    activeUploads.current.clear();
    
    setFiles([]);
    setIsUploading(false);
  }, []);

  // Upload single file with progress tracking
  const uploadFile = useCallback(async (uploadFile: UploadFile): Promise<void> => {
    const controller = new AbortController();
    abortControllers.current.set(uploadFile.id, controller);

    try {
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'uploading', progress: 0, startTime: Date.now() }
          : f
      ));

      // Get auth session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No valid session');

      // Create FormData
      const formData = new FormData();
      formData.append('file', uploadFile.file);
      formData.append('department', 'Upload Queue');
      formData.append('category', 'Batch Upload');
      formData.append('subject', uploadFile.file.name);

      // Upload with enhanced progress tracking
      const response = await fetch('/api/upload-document-enhanced', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();

      // Mark as processing
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { 
              ...f, 
              status: 'processing',
              progress: 100,
              documentId: result.document?.id
            }
          : f
      ));

      // Simulate processing time (in real app, this would be WebSocket updates)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mark as completed
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'completed' }
          : f
      ));

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Upload was cancelled
        setFiles(prev => prev.filter(f => f.id !== uploadFile.id));
      } else {
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { 
                ...f, 
                status: 'error',
                error: error instanceof Error ? error.message : 'Upload failed'
              }
            : f
        ));
      }
    } finally {
      activeUploads.current.delete(uploadFile.id);
      abortControllers.current.delete(uploadFile.id);
    }
  }, []);

  // Upload all pending files with concurrency control
  const uploadAll = useCallback(async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    try {
      // Process files in batches to respect concurrency limit
      for (let i = 0; i < pendingFiles.length; i += maxConcurrent) {
        const batch = pendingFiles.slice(i, i + maxConcurrent);
        
        // Upload batch concurrently
        await Promise.allSettled(
          batch.map(file => {
            activeUploads.current.add(file.id);
            return uploadFile(file);
          })
        );
      }
    } catch (error) {
      console.error('Batch upload error:', error);
    } finally {
      setIsUploading(false);
    }
  }, [files, maxConcurrent, uploadFile]);

  // Retry failed upload
  const retryUpload = useCallback(async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file || file.status !== 'error') return;

    setFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, status: 'pending' as const, progress: 0 }
        : f
    ));

    await uploadFile(file);
  }, [files, uploadFile]);

  // Get queue statistics
  const getStats = useCallback(() => {
    const totalFiles = files.length;
    const pendingFiles = files.filter(f => f.status === 'pending').length;
    const uploadingFiles = files.filter(f => f.status === 'uploading').length;
    const processingFiles = files.filter(f => f.status === 'processing').length;
    const completedFiles = files.filter(f => f.status === 'completed').length;
    const errorFiles = files.filter(f => f.status === 'error').length;
    
    const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
    const uploadedSize = files.reduce((sum, f) => {
      if (f.status === 'completed') return sum + f.file.size;
      if (f.status === 'uploading') return sum + (f.file.size * f.progress / 100);
      return sum;
    }, 0);

    const overallProgress = totalSize > 0 ? Math.round((uploadedSize / totalSize) * 100) : 0;

    return {
      totalFiles,
      pendingFiles,
      uploadingFiles,
      processingFiles,
      completedFiles,
      errorFiles,
      totalSize,
      uploadedSize,
      overallProgress,
      isActive: uploadingFiles > 0 || processingFiles > 0
    };
  }, [files]);

  return {
    files,
    isUploading,
    addFiles,
    removeFile,
    clearAll,
    uploadAll,
    retryUpload,
    getStats
  };
}