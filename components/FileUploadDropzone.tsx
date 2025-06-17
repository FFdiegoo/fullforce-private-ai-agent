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

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!allowedTypes.includes(file.type)) {
      onUploadError?.('Alleen PDF, Word, Excel en tekstbestanden zijn toegestaan');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      onUploadError?.('Bestand is te groot. Maximum 10MB toegestaan');
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

      // Create safe filename
      const timestamp = Date.now();
      const safeFileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const storagePath = `uploads/${safeFileName}`;

      // Upload to Supabase Storage
      const { data: storageData, error: storageError } = await supabase.storage
        .from('company-docs')
        .upload(storagePath, file, {
          onUploadProgress: (progress) => {
            setUploadProgress((progress.loaded / progress.total) * 100);
          }
        });

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
          ready_for_indexing: false, // Needs admin approval first
          processed: false
        });

      if (dbError) {
        throw new Error(`Database fout: ${dbError.message}`);
      }

      onUploadSuccess?.(file.name);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('Upload error:', error);
      onUploadError?.(error instanceof Error ? error.message : 'Upload mislukt');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
        className="hidden"
      />
      
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all duration-200
          ${isDragging 
            ? 'border-indigo-500 bg-indigo-50' 
            : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
          }
          ${isUploading ? 'pointer-events-none opacity-75' : ''}
        `}
      >
        {isUploading ? (
          <div className="text-center">
            <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">Uploading... {Math.round(uploadProgress)}%</p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-8 h-8 mx-auto mb-2 text-gray-400">
              📎
            </div>
            <p className="text-sm text-gray-600 font-medium">
              {isDragging ? 'Drop bestand hier' : 'Klik of sleep bestand hierheen'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              PDF, Word, Excel, TXT (max 10MB)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}