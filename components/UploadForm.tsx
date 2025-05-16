import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Metadata {
  afdeling: string;
  categorie: string;
  onderwerp: string;
  versie: string;
}

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [metadata, setMetadata] = useState<Metadata>({
    afdeling: '',
    categorie: '',
    onderwerp: '',
    versie: ''
  });

  const handleUpload = async () => {
    if (!file) {
      alert('Selecteer eerst een bestand');
      return;
    }

    try {
      setIsUploading(true);

      // Creëer een veilige bestandsnaam
      const timestamp = Date.now();
      const safeFileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const path = `${metadata.afdeling}/${metadata.categorie}/${safeFileName}`;

      // Upload naar Supabase Storage
      const { data: storageData, error: storageError } = await supabase.storage
        .from('company-docs')
        .upload(path, file);

      if (storageError) {
        throw new Error(`Storage error: ${storageError.message}`);
      }

      // Sla metadata op in de database
      const { error: dbError } = await supabase
        .from('documents_metadata')
        .insert([
          {
            filename: file.name,
            safe_filename: safeFileName,
            storage_path: path,
            file_size: file.size,
            mime_type: file.type,
            ...metadata,
            uploaded_by: (await supabase.auth.getUser()).data.user?.email || 'unknown',
            last_updated: new Date().toISOString(),
            ready_for_indexing: true
          }
        ]);

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      // Reset form
      setFile(null);
      setMetadata({
        afdeling: '',
        categorie: '',
        onderwerp: '',
        versie: ''
      });

      alert('Document succesvol geüpload!');

    } catch (error) {
      console.error('Upload error:', error);
      alert(error instanceof Error ? error.message : 'Er ging iets mis bij het uploaden');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Document Upload</h2>

      {/* Bestandsselectie */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Selecteer document
        </label>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isUploading}
        />
        {file && (
          <p className="mt-2 text-sm text-gray-600">
            Geselecteerd: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
          </p>
        )}
      </div>

      {/* Metadata formulier */}
      <div className="grid grid-cols-1 gap-6 mb-6">
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

      {/* Upload knop */}
      <button
        onClick={handleUpload}
        disabled={!file || isUploading || !metadata.afdeling || !metadata.categorie}
        className={`
          w-full px-4 py-2 text-white font-medium rounded-md shadow-sm
          ${(!file || isUploading || !metadata.afdeling || !metadata.categorie)
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'}
          transition-colors duration-200
        `}
      >
        {isUploading ? 'Bezig met uploaden...' : 'Upload Document'}
      </button>
    </div>
  );
}