import { NextApiRequest, NextApiResponse } from 'next';
import formidable, { File as FormidableFile } from 'formidable';
import fs from 'fs';
import { supabase } from '@/lib/rag/config';
import { v4 as uuidv4 } from 'uuid';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false, // Disable response limit for large files
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Configure formidable for large files
  const form = formidable({ 
    multiples: false,
    maxFileSize: 1024 * 1024 * 1024, // 1GB
    maxFieldsSize: 20 * 1024 * 1024, // 20MB for form fields
    keepExtensions: true,
    uploadDir: '/tmp', // Use temp directory for large files
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Formidable error:', err);
      return res.status(500).json({ error: 'File upload failed', details: err.message });
    }

    const fileInput = files.file;
    const file = Array.isArray(fileInput) ? fileInput[0] : fileInput as FormidableFile;

    if (!file || typeof file !== 'object' || !('filepath' in file)) {
      return res.status(400).json({ error: 'No valid file provided' });
    }

    try {
      // Create read stream for large file handling
      const stream = fs.createReadStream(file.filepath);
      const fileExt = file.originalFilename?.split('.').pop();
      const safeName = `${uuidv4()}.${fileExt}`;
      const storagePath = `uploads/${safeName}`;

      // Upload to Supabase with optimized settings
      const { error: uploadError } = await supabase.storage
        .from('company-docs')
        .upload(storagePath, stream, {
          contentType: file.mimetype || 'application/octet-stream',
          upsert: true,
          duplex: 'half', // Optimize for large files
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload file to storage', details: uploadError.message });
      }

      // Save metadata to database
      const { error: dbError, data } = await supabase
        .from('documents_metadata')
        .insert({
          filename: file.originalFilename,
          safe_filename: safeName,
          storage_path: storagePath,
          file_size: file.size,
          mime_type: file.mimetype,
          afdeling: fields.afdeling?.toString() || '',
          categorie: fields.categorie?.toString() || '',
          onderwerp: fields.onderwerp?.toString() || '',
          versie: fields.versie?.toString() || '',
          uploaded_by: fields.user_id?.toString() || 'unknown',
          last_updated: new Date().toISOString(),
          ready_for_indexing: true,
          processed: false,
        })
        .select()
        .single();

      if (dbError) {
        console.error('DB insert error:', dbError);
        return res.status(500).json({ error: 'Failed to save metadata', details: dbError.message });
      }

      // Clean up temp file
      try {
        fs.unlinkSync(file.filepath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file:', cleanupError);
      }

      return res.status(200).json({ 
        success: true, 
        documentId: data.id,
        message: 'File uploaded successfully',
        fileSize: file.size,
        fileName: file.originalFilename
      });

    } catch (error) {
      console.error('Upload processing error:', error);
      
      // Clean up temp file on error
      try {
        fs.unlinkSync(file.filepath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file after error:', cleanupError);
      }
      
      return res.status(500).json({ 
        error: 'Upload processing failed', 
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}