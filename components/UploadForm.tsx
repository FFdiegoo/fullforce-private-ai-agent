import React, { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// TypeScript interfaces
interface Metadata {
  afdeling: string;
  categorie: string;
  onderwerp: string;
  versie: string;
}

interface DocumentMetadata extends Metadata {
  filename: string;
  safe_filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  last_updated: string;
  ready_for_indexing: boolean;
}

export default function UploadForm() {
  // Initialize Supabase client
  const supabase = createClientComponentClient();
  
  // State management
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [metadata, setMetadata] = useState<Metadata>({
    afdeling: '',
    categorie: '',
    onderwerp: '',
    versie: ''
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    
    if (selectedFile) {
      // Check file size (1GB limit)
      const maxSize = 1024 * 1024 * 1024; // 1GB
      if (selectedFile.size > maxSize) {
        alert(`Bestand te groot! Maximum: ${formatFileSize(maxSize)}, jouw bestand: ${formatFileSize(selectedFile.size)}`);
        e.target.value = ''; // Reset input
        return;
      }
    }
    
    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) {
      alert('Selecteer eerst een bestand');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);

      // Create safe filename
      const timestamp = Date.now();
      const safeFileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const path = `${metadata.afdeling}/${metadata.categorie}/${safeFileName}`;

      // Simulate progress
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
        .upload(path, file, {
          duplex: 'half' // Optimize for large files
        });

      clearInterval(progressInterval);
      setUploadProgress(95);

      if (storageError) {
        throw new Error(`Storage error: ${storageError.message}`);
      }

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        throw new Error(`Auth error: ${userError.message}`);
      }

      // Prepare metadata for database
      const documentMetadata: DocumentMetadata = {
        filename: file.name,
        safe_filename: safeFileName,
        storage_path: path,
        file_size: file.size,
        mime_type: file.type,
        ...metadata,
        uploaded_by: user?.email || 'unknown',
        last_updated: new Date().toISOString(),
        ready_for_indexing: true
      };

      // Save metadata to database
      const { error: dbError } = await supabase
        .from('documents_metadata')
        .insert([documentMetadata]);

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      setUploadProgress(100);

      // Reset form after short delay
      setTimeout(() => {
        setFile(null);
        setMetadata({
          afdeling: '',
          categorie: '',
          onderwerp: '',
          versie: ''
        });
        setUploadProgress(0);
        alert('Document succesvol geüpload!');
      }, 500);

    } catch (error) {
      console.error('Upload error:', error);
      alert(error instanceof Error ? error.message : 'Er ging iets mis bij het uploaden');
    } finally {
      setTimeout(() => {
        setIsUploading(false);
      }, 1000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Document Upload</h2>

      {/* File selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Selecteer document
        </label>
        <input
          type="file"
          onChange={handleFileChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isUploading}
          accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx,.rtf,.zip,.jpg,.jpeg,.png,.gif,.bmp,.tiff"
        />
        {file && (
          <div className="mt-2 p-3 bg-gray-50 rounded-md">
            <p className="text-sm text-gray-700">
              <strong>Geselecteerd:</strong> {file.name}
            </p>
            <p className="text-sm text-gray-600">
              <strong>Grootte:</strong> {formatFileSize(file.size)}
            </p>
            <p className="text-sm text-gray-600">
              <strong>Type:</strong> {file.type || 'Onbekend'}
            </p>
          </div>
        )}
      </div>

      {/* Upload Progress */}
      {isUploading && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700">Uploading...</span>
            <span className="text-sm text-blue-600">{Math.round(uploadProgress)}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p className="text-xs text-blue-600 mt-1">
            Grote bestanden kunnen even duren...
          </p>
        </div>
      )}

      {/* Metadata form */}
      <div className="grid grid-cols-1 gap-6 mb-6">
        {/* Afdeling field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Afdeling
          </label>
          <input
            type="text"
            value={metadata.afdeling}
            onChange={(e) => setMetadata({...metadata, afdeling: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Bijv. Techniek"
            disabled={isUploading}
          />
        </div>

        {/* Categorie field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Categorie
          </label>
          <input
            type="text"
            value={metadata.categorie}
            onChange={(e) => setMetadata({...metadata, categorie: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Bijv. Handleidingen"
            disabled={isUploading}
          />
        </div>

        {/* Onderwerp field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Onderwerp
          </label>
          <input
            type="text"
            value={metadata.onderwerp}
            onChange={(e) => setMetadata({...metadata, onderwerp: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Bijv. Machine X"
            disabled={isUploading}
          />
        </div>

        {/* Versie field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Versie
          </label>
          <input
            type="text"
            value={metadata.versie}
            onChange={(e) => setMetadata({...metadata, versie: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Bijv. 1.0"
            disabled={isUploading}
          />
        </div>
      </div>

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!file || isUploading || !metadata.afdeling || !metadata.categorie}
        className={`
          w-full px-4 py-3 text-white font-medium rounded-md shadow-sm text-lg
          ${(!file || isUploading || !metadata.afdeling || !metadata.categorie)
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transform hover:scale-[1.01]'}
          transition-all duration-200
        `}
      >
        {isUploading ? `Uploading... ${Math.round(uploadProgress)}%` : 'Upload Document'}
      </button>

      {/* File size info */}
      <div className="mt-4 p-3 bg-gray-50 rounded-md">
        <p className="text-xs text-gray-600">
          <strong>Ondersteunde bestanden:</strong> PDF, Word, Excel, PowerPoint, afbeeldingen, tekst, ZIP
        </p>
        <p className="text-xs text-gray-600 mt-1">
          <strong>Maximum bestandsgrootte:</strong> 1GB (1024 MB)
        </p>
      </div>
    </div>
  );
}