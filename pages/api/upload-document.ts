import { NextApiRequest, NextApiResponse } from 'next';
import formidable, { File as FormidableFile } from 'formidable';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Disable body parser to handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

// Typeguard voor FormidableFile
function isFormidableFile(file: unknown): file is FormidableFile {
  return !!file && typeof file === 'object' && 'filepath' in file;
}

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

    // Get the uploaded file (handle both array and single file)
    const fileInput = files.file;
    const fileCandidate = Array.isArray(fileInput) ? fileInput[0] : fileInput;

    if (!isFormidableFile(fileCandidate)) {
      return res.status(400).json({ error: 'No file uploaded or multiple files detected' });
    }
    const file = fileCandidate;

    // Extract metadata from form fields
    const department = Array.isArray(fields.department) ? fields.department[0] : fields.department || 'Unknown';
    const category = Array.isArray(fields.category) ? fields.category[0] : fields.category || 'Unknown';
    const subject = Array.isArray(fields.subject) ? fields.subject[0] : fields.subject || 'Unknown';
    const version = Array.isArray(fields.version) ? fields.version[0] : fields.version || '1.0';
    const uploadedBy = Array.isArray(fields.uploadedBy) ? fields.uploadedBy[0] : fields.uploadedBy || 'api-upload';

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
    try {
      fs.unlinkSync(file.filepath);
    } catch (cleanupError) {
      // Niet kritisch, log alleen
      console.warn('Failed to cleanup temp file:', cleanupError);
    }

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