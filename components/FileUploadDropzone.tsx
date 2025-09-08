import React, { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

interface FileUploadDropzoneProps {
  onUploadSuccess?: (filename: string) => void;
  onUploadError?: (error: string) => void;
}

export default function FileUploadDropzone({ onUploadSuccess, onUploadError }: FileUploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Validate file type - allow all common document types
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/rtf',
      'text/rtf',
      'application/zip',
      'application/x-zip-compressed',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/tiff'
    ];

    if (!allowedTypes.includes(file.type)) {
      onUploadError?.('Bestandstype niet ondersteund. Probeer PDF, Word, Excel, PowerPoint, afbeeldingen of tekstbestanden.');
      return;
    }

    // Validate file size (max 1GB for safety)
    const maxSize = 1024 * 1024 * 1024; // 1GB
    if (file.size > maxSize) {
      onUploadError?.(
        `Bestand is te groot. Maximum ${formatFileSize(maxSize)} toegestaan. ` +
        `Jouw bestand: ${formatFileSize(file.size)}`
      );
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Gebruiker niet ingelogd');
      }

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', user.email)
        .single();

      if (profileError || !profile) {
        throw new Error('Gebruikersprofiel niet gevonden');
      }

      // Create safe filename with timestamp
      const timestamp = Date.now();
      const safeFileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const storagePath = `uploads/${safeFileName}`;

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 10;
        });
      }, 200);

      // Upload to Supabase Storage with optimized settings
      const { data: storageData, error: storageError } = await supabase.storage
        .from('company-docs')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
          duplex: 'half' // Optimize for large files
        });

      clearInterval(progressInterval);
      setUploadProgress(95);

      if (storageError) {
        throw new Error(`Upload fout: ${storageError.message}`);
      }

      // Save metadata to database
      const { error: dbError } = await supabase
        .from('documents_metadata')
        .insert({
          filename: file.name,
          safe_filename: safeFileName,
          storage_path: storagePath,
          file_size: file.size,
          mime_type: file.type,
          afdeling: 'Chat Upload',
          categorie: 'User Upload',
          onderwerp: 'Via Chat Interface',
          versie: '1.0',
          uploaded_by: profile.email,
          last_updated: new Date().toISOString(),
          ready_for_indexing: true,
          processed: false
        });

      if (dbError) {
        throw new Error(`Database fout: ${dbError.message}`);
      }

      setUploadProgress(100);
      
      // Small delay to show 100% progress
      setTimeout(() => {
        onUploadSuccess?.(file.name);
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }, 500);

    } catch (error) {
      console.error('Upload error:', error);
      onUploadError?.(error instanceof Error ? error.message : 'Upload mislukt');
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 1000);
    }
  };

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx,.rtf,.zip,.jpg,.jpeg,.png,.gif,.bmp,.tiff"
        className="hidden"
      />
      
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all duration-200
          ${isDragging 
            ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' 
            : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
          }
          ${isUploading ? 'pointer-events-none opacity-75' : ''}
        `}
      >
        {isUploading ? (
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full mx-auto mb-3"></div>
            <p className="text-sm text-gray-600 font-medium">
              Uploading... {Math.round(uploadProgress)}%
            </p>
            <div className="w-full bg-gray-200 rounded-full h-3 mt-3">
              <div 
                className="bg-gradient-to-r from-indigo-600 to-purple-600 h-3 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Grote bestanden kunnen even duren...
            </p>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-3 text-gray-400 flex items-center justify-center">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-base text-gray-700 font-medium mb-1">
              {isDragging ? 'Drop bestand hier' : 'Klik of sleep bestand hierheen'}
            </p>
            <p className="text-sm text-gray-500">
              Alle documenttypen ondersteund • Max 1GB
            </p>
            <p className="text-xs text-gray-400 mt-2">
              PDF, Word, Excel, PowerPoint, afbeeldingen, tekst, ZIP
            </p>
          </div>
        )}
      </div>
    </div>
  );
}