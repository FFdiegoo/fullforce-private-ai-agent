// components/UploadForm.tsx
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState({
    afdeling: '',
    categorie: '',
    onderwerp: '',
    versie: ''
  });
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      alert('Selecteer eerst een bestand');
      return;
    }

    try {
      setIsUploading(true);
      const path = `${metadata.afdeling}/${metadata.categorie}/${file.name}`;

      // Upload bestand naar Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from('company-docs')
        .upload(path, file);

      if (uploadError) {
        throw new Error('Upload mislukt: ' + uploadError.message);
      }

      // Sla metadata op in de database
      const { error: metadataError } = await supabase
        .from('documents_metadata')
        .insert({
          filename: file.name,
          path,
          afdeling: metadata.afdeling,
          categorie: metadata.categorie,
          onderwerp: metadata.onderwerp,
          versie: metadata.versie,
          uploaded_by: 'Diego',
          last_updated: new Date().toISOString(),
          ready_for_indexing: true,
        });

      if (metadataError) {
        throw new Error('Metadata opslaan mislukt: ' + metadataError.message);
      }

      // Reset form na succesvolle upload
      setFile(null);
      setMetadata({
        afdeling: '',
        categorie: '',
        onderwerp: '',
        versie: ''
      });
      alert('Upload succesvol afgerond!');

    } catch (error) {
      console.error('Upload error:', error);
      alert(error instanceof Error ? error.message : 'Er ging iets mis bij het uploaden');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Document Upload</h2>
      
      {/* Bestand selectie */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Selecteer bestand
        </label>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          disabled={isUploading}
        />
        {file && (
          <p className="mt-2 text-sm text-gray-600">
            Geselecteerd: {file.name}
          </p>
        )}
      </div>

      {/* Metadata formulier */}
      <div className="space-y-4">
        {/* Afdeling */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Afdeling
          </label>
          <input
            type="text"
            value={metadata.afdeling}
            onChange={(e) => setMetadata({...metadata, afdeling: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Bijv. Techniek"
            disabled={isUploading}
          />
        </div>

        {/* Categorie */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Categorie
          </label>
          <input
            type="text"
            value={metadata.categorie}
            onChange={(e) => setMetadata({...metadata, categorie: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Bijv. Handleidingen"
            disabled={isUploading}
          />
        </div>

        {/* Onderwerp */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Onderwerp
          </label>
          <input
            type="text"
            value={metadata.onderwerp}
            onChange={(e) => setMetadata({...metadata, onderwerp: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Bijv. Machine X"
            disabled={isUploading}
          />
        </div>

        {/* Versie */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Versie
          </label>
          <input
            type="text"
            value={metadata.versie}
            onChange={(e) => setMetadata({...metadata, versie: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Bijv. 1.0"
            disabled={isUploading}
          />
        </div>
      </div>

      {/* Upload knop */}
      <button
        onClick={handleUpload}
        disabled={!file || isUploading}
        className={`
          w-full mt-6 px-4 py-2 rounded-md text-white font-medium
          ${isUploading 
            ? 'bg-gray-400 cursor-not-allowed' 
            : 'bg-blue-600 hover:bg-blue-700'}
          transition-colors duration-200
        `}
      >
        {isUploading ? 'Bezig met uploaden...' : 'Upload Document'}
      </button>
    </div>
  );
}