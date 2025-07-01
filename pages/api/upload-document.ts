import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Disable body parser to handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse form data with formidable
    const form = new formidable.IncomingForm({
      maxFileSize: 50 * 1024 * 1024, // 50MB limit
      keepExtensions: true,
      multiples: false,
    });

    // Parse the form
    const [fields, files] = await new Promise<[formidable.Fields, formidable.Files]>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // Get the uploaded file
    const file = files.file;
    if (!file || Array.isArray(file)) {
      return res.status(400).json({ error: 'No file uploaded or multiple files detected' });
    }

    // Extract metadata from form fields
    const department = fields.department?.[0] || 'Unknown';
    const category = fields.category?.[0] || 'Unknown';
    const subject = fields.subject?.[0] || 'Unknown';
    const version = fields.version?.[0] || '1.0';
    const uploadedBy = fields.uploadedBy?.[0] || 'api-upload';

    // Generate a safe filename with timestamp and UUID
    const timestamp = Date.now();
    const uniqueId = uuidv4().substring(0, 8);
    const safeFileName = `${timestamp}_${uniqueId}_${file.originalFilename?.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const storagePath = `uploads/${safeFileName}`;

    // Upload file to Supabase Storage
    const fileBuffer = fs.readFileSync(file.filepath);
    const { error: storageError } = await supabaseAdmin.storage
      .from('company-docs')
      .upload(storagePath, fileBuffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: false,
      });

    if (storageError) {
      return res.status(500).json({ error: `Storage upload failed: ${storageError.message}` });
    }

    // Save metadata to database
    const { data: documentData, error: metadataError } = await supabaseAdmin
      .from('documents_metadata')
      .insert({
        filename: file.originalFilename,
        safe_filename: safeFileName,
        storage_path: storagePath,
        file_size: fileBuffer.length,
        mime_type: file.mimetype,
        afdeling: department,
        categorie: category,
        onderwerp: subject,
        versie: version,
        uploaded_by: uploadedBy,
        last_updated: new Date().toISOString(),
        ready_for_indexing: true,
        processed: false,
      })
      .select()
      .single();

    if (metadataError) {
      return res.status(500).json({ error: `Metadata storage failed: ${metadataError.message}` });
    }

    // Clean up temporary file
    fs.unlinkSync(file.filepath);

    // Return success response
    return res.status(200).json({
      success: true,
      documentId: documentData.id,
      message: 'Document uploaded successfully',
      metadata: {
        filename: file.originalFilename,
        size: fileBuffer.length,
        mimeType: file.mimetype,
        department,
        category,
        subject,
        version,
      },
    });
  } catch (error: any) {
    console.error('Error uploading document:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An unknown error occurred',
    });
  }
}