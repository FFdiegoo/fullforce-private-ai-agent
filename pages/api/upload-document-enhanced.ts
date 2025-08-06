import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabaseClient';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { auditLogger } from '../../lib/enhanced-audit-logger';
import { applyEnhancedRateLimit } from '../../lib/enhanced-rate-limiter';
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Enhanced file type validation
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'text/rtf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/tiff'
];

const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB
const MAX_CONCURRENT_UPLOADS = 5;

interface UploadResult {
  success: boolean;
  document?: any;
  error?: string;
  fileInfo?: {
    originalName: string;
    safeFilename: string;
    fileSize: number;
    mimeType: string;
    checksum: string;
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || '127.0.0.1';

  try {
    // Enhanced rate limiting for uploads
    const rateLimitResult = await applyEnhancedRateLimit(clientIP, 'upload', {
      endpoint: '/api/upload-document-enhanced',
      userAgent: req.headers['user-agent']
    });

    if (!rateLimitResult.success) {
      return res.status(429).json({ 
        error: 'Upload rate limit exceeded',
        retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
      });
    }

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
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('email', user.email)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Create secure upload directory
    const uploadDir = path.join(process.cwd(), 'temp-uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Enhanced formidable configuration
    const form = formidable({
      uploadDir,
      keepExtensions: true,
      maxFileSize: MAX_FILE_SIZE,
      maxFiles: MAX_CONCURRENT_UPLOADS,
      filename: (name, ext, part) => {
        const timestamp = Date.now();
        const randomId = crypto.randomBytes(8).toString('hex');
        const safeName = part.originalFilename?.replace(/[^a-zA-Z0-9.-]/g, '_') || 'unknown';
        return `${timestamp}_${randomId}_${safeName}`;
      },
      filter: ({ mimetype }) => {
        return SUPPORTED_MIME_TYPES.includes(mimetype || '');
      }
    });

    try {
      const [fields, files] = await form.parse(req);
      // Ensure uploadedFiles is an array of formidable.File, filtering out any undefined/null
      const uploadedFiles: formidable.File[] = (Array.isArray(files.file) ? files.file : [files.file])
        .filter((f): f is formidable.File => f !== undefined && f !== null);
      if (uploadedFiles.length === 0) {
        return res.status(400).json({ error: 'No valid files uploaded' });
      }

      const results: UploadResult[] = [];

      // Process each file
      for (const file of uploadedFiles) {
        try {
          const result = await processUploadedFile(file, profile, fields);
          results.push(result);
        } catch (error) {
          results.push({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            fileInfo: {
              originalName: file.originalFilename || 'unknown',
              safeFilename: '',
              fileSize: file.size,
              mimeType: file.mimetype || 'unknown',
              checksum: ''
            }
          });
        } finally {
          // Clean up temporary file
          try {
            if (fs.existsSync(file.filepath)) {
              fs.unlinkSync(file.filepath);
            }
          } catch (cleanupError) {
            console.warn('Failed to cleanup temp file:', cleanupError);
          }
        }
      }

      // Log upload batch
      await auditLogger.logAuth('BATCH_UPLOAD_COMPLETED', profile.id, {
        totalFiles: results.length,
        successfulUploads: results.filter(r => r.success).length,
        failedUploads: results.filter(r => !r.success).length,
        totalSize: results.reduce((sum, r) => sum + (r.fileInfo?.fileSize || 0), 0)
      }, clientIP);

      // Return results
      const successfulUploads = results.filter(r => r.success);
      const failedUploads = results.filter(r => !r.success);

      return res.status(200).json({
        success: true,
        message: `Upload completed: ${successfulUploads.length} successful, ${failedUploads.length} failed`,
        results: {
          successful: successfulUploads.length,
          failed: failedUploads.length,
          total: results.length
        },
        uploads: results,
        nextSteps: successfulUploads.length > 0 
          ? 'Documents are queued for processing. Check admin dashboard for approval status.'
          : 'No documents were successfully uploaded.'
      });

    } catch (parseError) {
      console.error('Form parsing error:', parseError);
      return res.status(400).json({
        error: 'File parsing failed',
        details: parseError instanceof Error ? parseError.message : 'Unknown parsing error'
      });
    }

  } catch (error) {
    console.error('Upload API error:', error);
    await auditLogger.logError(error as Error, 'UPLOAD_API_ERROR');
    
    return res.status(500).json({
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function processUploadedFile(
  file: formidable.File, 
  profile: any, 
  fields: formidable.Fields
): Promise<UploadResult> {
  try {
    // Validate file
    if (!file.originalFilename) {
      throw new Error('No filename provided');
    }

    if (!SUPPORTED_MIME_TYPES.includes(file.mimetype || '')) {
      throw new Error(`Unsupported file type: ${file.mimetype}`);
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${file.size} bytes (max: ${MAX_FILE_SIZE})`);
    }

    // Generate file checksum for integrity verification
    const fileBuffer = fs.readFileSync(file.filepath);
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Generate safe filename
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(4).toString('hex');
    const safeFilename = `${timestamp}_${randomId}_${file.originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const storagePath = `uploads/${safeFilename}`;

    // Upload to Supabase Storage with enhanced options
    const { data: storageData, error: storageError } = await supabaseAdmin.storage
      .from('company-docs')
      .upload(storagePath, fileBuffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: false,
        duplex: 'half'
      });

    if (storageError) {
      throw new Error(`Storage upload failed: ${storageError.message}`);
    }

    // Extract metadata from fields
    const department = Array.isArray(fields.department) ? fields.department[0] : fields.department || 'Upload Interface';
    const category = Array.isArray(fields.category) ? fields.category[0] : fields.category || 'User Upload';
    const subject = Array.isArray(fields.subject) ? fields.subject[0] : fields.subject || file.originalFilename;

    // Create enhanced document metadata record
    const { data: document, error: dbError } = await supabaseAdmin
      .from('documents_metadata')
      .insert({
        filename: file.originalFilename,
        safe_filename: safeFilename,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.mimetype || 'application/octet-stream',
        content_type: file.mimetype || 'application/octet-stream',
        upload_date: new Date().toISOString(),
        afdeling: department,
        categorie: category,
        onderwerp: subject,
        versie: '1.0',
        uploaded_by: profile.email,
        user_id: profile.id,
        last_updated: new Date().toISOString(),
        ready_for_indexing: true,
        processed: false,
        embedding_status: 'PENDING',
        metadata: {
          originalFilename: file.originalFilename,
          uploadedAt: new Date().toISOString(),
          uploadedBy: profile.email,
          checksum,
          uploadMethod: 'enhanced_interface'
        }
      })
      .select()
      .single();

    if (dbError) {
      // Clean up storage if database insert fails
      await supabaseAdmin.storage.from('company-docs').remove([storagePath]);
      throw new Error(`Database error: ${dbError.message}`);
    }

    return {
      success: true,
      document,
      fileInfo: {
        originalName: file.originalFilename,
        safeFilename,
        fileSize: file.size,
        mimeType: file.mimetype || 'application/octet-stream',
        checksum
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      fileInfo: {
        originalName: file.originalFilename || 'unknown',
        safeFilename: '',
        fileSize: file.size,
        mimeType: file.mimetype || 'unknown',
        checksum: ''
      }
    };
  }
}