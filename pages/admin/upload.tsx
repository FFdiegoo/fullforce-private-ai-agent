import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialiseer Supabase client (je kunt dit later naar een aparte config file verplaatsen)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState({
    afdeling: '',
    categorie: '',
    onderwerp: '',
    versie: ''
  });

  const handleUpload = async () => {
    if (!file) return;

    try {
      // Upload het bestand naar Supabase Storage
      const { data, error } = await supabase.storage
        .from('documents')
        .upload(`${Date.now()}-${file.name}`, file);

      if (error) throw error;

      // Sla metadata op in de database
      const { error: dbError } = await supabase
        .from('documents')
        .insert([
          {
            filename: file.name,
            storage_path: data?.path,
            ...metadata
          }
        ]);

      if (dbError) throw dbError;

      // Reset form
      setFile(null);
      setMetadata({
        afdeling: '',
        categorie: '',
        onderwerp: '',
        versie: ''
      });

      alert('Bestand succesvol geüpload!');
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Er ging iets mis bij het uploaden.');
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Document Upload</h2>
      
      {/* Bestand selectie */}