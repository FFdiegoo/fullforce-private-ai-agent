// components/UploadForm.tsx
import React from 'react';
import { supabase } from '../lib/supabaseClient';

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState({ afdeling: '', categorie: '', onderwerp: '', versie: '' });

  const handleUpload = async () => {
    if (!file) return;

    const path = `${metadata.afdeling}/${metadata.categorie}/${file.name}`;

    const { data, error } = await supabase.storage.from('company-docs').upload(path, file);

    if (error) {
      alert('Upload mislukt');
      return;
    }

    await supabase.from('documents_metadata').insert({
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

    alert('Upload gelukt!');
  };

  return (
    <div className="p-4">
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <input placeholder="Afdeling" onChange={(e) => setMetadata({...metadata, afdeling: e.target.value})} />
      <input placeholder="Categorie" onChange={(e) => setMetadata({...metadata, categorie: e.target.value})} />
      <input placeholder="Onderwerp" onChange={(e) => setMetadata({...metadata, onderwerp: e.target.value})} />
      <input placeholder="Versie" onChange={(e) => setMetadata({...metadata, versie: e.target.value})} />
      <button onClick={handleUpload}>Uploaden</button>
    </div>
  );
}
