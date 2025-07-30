import { NextApiRequest, NextApiResponse } from 'next';
import { DocumentService } from '../../lib/database/documents';
import { EmbeddingStatus } from '../../lib/types/database';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({
      uploadDir: './uploads',
      keepExtensions: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
    });

    const [fields, files] = await form.parse(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate safe filename
    const timestamp = Date.now();
    const originalName = file.originalFilename || 'unknown';
    const extension = path.extname(originalName);
    const safeFilename = `${timestamp}_${originalName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    // Get file stats
    const stats = fs.statSync(file.filepath);
    const fileSize = stats.size;
    const contentType = file.mimetype || 'application/octet-stream';

    // Create document record with RAG pipeline fields
    const document = await DocumentService.createDocument({
      filename: originalName,
      safe_filename: safeFilename,
      file_size: fileSize,
      content_type: contentType,
      uploadPath: file.filepath,
      uploadedBy: 'system', // TODO: Get from auth
      department: fields.department?.[0],
      category: fields.category?.[0],
      subject: fields.subject?.[0],
      description: fields.description?.[0],
      metadata: {
        originalPath: file.filepath,
        uploadTimestamp: timestamp,
      },
    });

    res.status(200).json({
      success: true,
      document: {
        id: document.id,
        filename: document.filename,
        safe_filename: document.safe_filename,
        file_size: document.file_size,
        content_type: document.content_type,
        upload_date: document.upload_date,
        embedding_status: document.embedding_status,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}