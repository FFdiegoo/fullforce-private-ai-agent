import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabaseClient';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { auditLogger } from '../../lib/audit-logger';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Supported file types for RAG pipeline
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/csv',
  'application/rtf'
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', user.email)
      .single();

    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Create upload directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const form = formidable({
      uploadDir,
      keepExtensions: true,
      maxFileSize: MAX_FILE_SIZE,
      filename: (name, ext, part) => {
        // Generate safe filename with timestamp
        const timestamp = Date.now();
        const safeName = part.originalFilename?.replace(/[^a-zA-Z0-9.-]/g, '_') || 'unknown';
        return `${timestamp}_${safeName}`;
      }
    });

    const [fields, files] = await form.parse(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate file type
    if (!SUPPORTED_MIME_TYPES.includes(file.mimetype || '')) {
      // Clean up uploaded file
      fs.unlinkSync(file.filepath);
      return res.status(400).json({ 
        error: 'Unsupported file type',
        supportedTypes: SUPPORTED_MIME_TYPES
      });
    }

    // Get file stats
    const stats = fs.statSync(file.filepath);
    const fileSize = stats.size;

    // Generate safe filename for storage
    const timestamp = Date.now();
    const originalName = file.originalFilename || 'unknown';
    const safeFilename = `${timestamp}_${originalName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    // Upload to Supabase Storage
    const fileBuffer = fs.readFileSync(file.filepath);
    const storagePath = `uploads/${safeFilename}`;

    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from('company-docs')
      .upload(storagePath, fileBuffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: false
      });

    if (storageError) {
      // Clean up local file
      fs.unlinkSync(file.filepath);
      throw new Error(`Storage upload failed: ${storageError.message}`);
    }

    // Create document metadata record
    const { data: document, error: dbError } = await supabaseAdmin
      .from('documents_metadata')
      .insert({
        filename: originalName,
        safe_filename: safeFilename,
        storage_path: storagePath,
        file_size: fileSize,
        mime_type: file.mimetype || 'application/octet-stream',
        afdeling: fields.department?.[0] || 'RAG Upload',
        categorie: fields.category?.[0] || 'User Upload',
        onderwerp: fields.subject?.[0] || originalName,
        versie: '1.0',
        uploaded_by: profile.email,
        last_updated: new Date().toISOString(),
        ready_for_indexing: true, // Ready for processing
        processed: false
      })
      .select()
      .single();

    if (dbError) {
      // Clean up storage and local file
      await supabaseAdmin.storage.from('company-docs').remove([storagePath]);
      fs.unlinkSync(file.filepath);
      throw new Error(`Database error: ${dbError.message}`);
    }

    // Clean up local file
    fs.unlinkSync(file.filepath);

    // Log the upload
    await auditLogger.logAuth('DOCUMENT_UPLOADED', profile.id, {
      filename: originalName,
      fileSize,
      mimeType: file.mimetype,
      documentId: document.id
    });

    res.status(200).json({
      success: true,
      document: {
        id: document.id,
        filename: document.filename,
        safe_filename: document.safe_filename,
        file_size: document.file_size,
        mime_type: document.mime_type,
        storage_path: document.storage_path,
        ready_for_indexing: document.ready_for_indexing,
        processed: document.processed,
        uploaded_at: document.last_updated
      },
      message: 'Document uploaded successfully and queued for processing'
    });

  } catch (error) {
    console.error('Upload error:', error);
    await auditLogger.logError(error as Error, 'DOCUMENT_UPLOAD');
    
    res.status(500).json({
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}