import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { supabase } from '@/lib/rag/config';
import { v4 as uuidv4 } from 'uuid';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Formidable error:', err);
      return res.status(500).json({ error: 'File upload failed' });
    }

    const file = files.file as formidable.File;
    const stream = fs.createReadStream(file.filepath);
    const fileExt = file.originalFilename?.split('.').pop();
    const safeName = `${uuidv4()}.${fileExt}`;
    const storagePath = `uploads/${safeName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('company-docs')
      .upload(storagePath, stream, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload file to storage' });
    }

    // Insert metadata into DB
    const { error: dbError, data } = await supabase
      .from('documents_metadata')
      .insert({
        filename: file.originalFilename,
        safe_filename: safeName,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.mimetype,
        afdeling: fields.afdeling || '',
        categorie: fields.categorie || '',
        onderwerp: fields.onderwerp || '',
        versie: fields.versie || '',
        uploaded_by: fields.user_id || 'unknown',
        last_updated: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      console.error('DB insert error:', dbError);
      return res.status(500).json({ error: 'Failed to save metadata' });
    }

    return res.status(200).json({ success: true, documentId: data.id });
  });
}
