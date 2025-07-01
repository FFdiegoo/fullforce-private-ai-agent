import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';
import { supabase } from '@/lib/supabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// Disable body parser to handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define chunk size and overlap
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const EMBEDDING_MODEL = 'text-embedding-ada-002';

interface ProcessingResult {
  success: boolean;
  documentId?: string;
  error?: string;
  chunks?: number;
  embeddings?: number;
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
    // Check if environment variables are properly loaded
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.OPENAI_API_KEY) {
      throw new Error('Missing required environment variables');
    }

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

    // Process the document
    const result = await processDocument(
      file.filepath,
      file.originalFilename || 'unknown.txt',
      file.mimetype || 'text/plain',
      {
        department,
        category,
        subject,
        version,
        uploadedBy,
      }
    );

    // Return the result
    if (result.success) {
      return res.status(200).json({
        success: true,
        documentId: result.documentId,
        chunks: result.chunks,
        embeddings: result.embeddings,
        message: 'Document processed successfully',
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    console.error('Error processing document:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An unknown error occurred',
    });
  }
}

async function processDocument(
  filePath: string,
  fileName: string,
  mimeType: string,
  metadata: {
    department: string;
    category: string;
    subject: string;
    version: string;
    uploadedBy: string;
  }
): Promise<ProcessingResult> {
  try {
    console.log(`Processing document: ${fileName}`);

    // 1. Extract text from document
    const text = await extractText(filePath, mimeType);
    if (!text || text.trim().length === 0) {
      return { success: false, error: 'No text content could be extracted from the document' };
    }

    // 2. Generate a safe filename with timestamp and UUID
    const timestamp = Date.now();
    const uniqueId = uuidv4().substring(0, 8);
    const safeFileName = `${timestamp}_${uniqueId}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const storagePath = `uploads/${safeFileName}`;

    // 3. Upload file to Supabase Storage
    const fileBuffer = fs.readFileSync(filePath);
    const { error: storageError } = await supabaseAdmin.storage
      .from('company-docs')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (storageError) {
      return { success: false, error: `Storage upload failed: ${storageError.message}` };
    }

    // 4. Save metadata to database
    const { data: documentData, error: metadataError } = await supabaseAdmin
      .from('documents_metadata')
      .insert({
        filename: fileName,
        safe_filename: safeFileName,
        storage_path: storagePath,
        file_size: fileBuffer.length,
        mime_type: mimeType,
        afdeling: metadata.department,
        categorie: metadata.category,
        onderwerp: metadata.subject,
        versie: metadata.version,
        uploaded_by: metadata.uploadedBy,
        last_updated: new Date().toISOString(),
        ready_for_indexing: true,
        processed: false,
      })
      .select()
      .single();

    if (metadataError) {
      return { success: false, error: `Metadata storage failed: ${metadataError.message}` };
    }

    // 5. Split text into chunks
    const chunks = splitIntoChunks(text, CHUNK_SIZE, CHUNK_OVERLAP);
    console.log(`Created ${chunks.length} chunks`);

    // 6. Generate embeddings for chunks
    const embeddedChunks = await generateEmbeddings(chunks, documentData.id, metadata);
    console.log(`Generated ${embeddedChunks.length} embeddings`);

    // 7. Store chunks in database
    await storeChunks(embeddedChunks);
    console.log(`Stored ${embeddedChunks.length} chunks in database`);

    // 8. Mark document as processed
    await supabaseAdmin
      .from('documents_metadata')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq('id', documentData.id);

    // 9. Clean up temporary file
    fs.unlinkSync(filePath);

    return {
      success: true,
      documentId: documentData.id,
      chunks: chunks.length,
      embeddings: embeddedChunks.length,
    };
  } catch (error: any) {
    console.error('Error in processDocument:', error);
    return { success: false, error: error.message || 'Unknown error in document processing' };
  }
}

async function extractText(filePath: string, mimeType: string): Promise<string> {
  try {
    // Extract text based on file type
    if (mimeType === 'application/pdf') {
      // PDF extraction
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      return pdfData.text;
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      // Word document extraction
      const dataBuffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer: dataBuffer });
      return result.value;
    } else if (mimeType === 'text/plain' || mimeType.includes('text/')) {
      // Plain text extraction
      return fs.readFileSync(filePath, 'utf8');
    } else {
      // Fallback for unsupported types - try as text
      try {
        return fs.readFileSync(filePath, 'utf8');
      } catch (error) {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }
    }
  } catch (error: any) {
    console.error('Error extracting text:', error);
    throw new Error(`Text extraction failed: ${error.message}`);
  }
}

function splitIntoChunks(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/[.!?]+\s+/);
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Keep the overlap from the previous chunk
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(chunkOverlap / 5)); // Approximate word count for overlap
      currentChunk = overlapWords.join(' ') + ' ' + sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function generateEmbeddings(
  chunks: string[],
  documentId: string,
  metadata: any
): Promise<any[]> {
  const embeddedChunks = [];

  // Process in batches of 10 to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
    
    try {
      // Generate embeddings for the batch
      const embeddingResponse = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      });

      // Combine chunks with their embeddings
      for (let j = 0; j < batch.length; j++) {
        embeddedChunks.push({
          content: batch[j],
          embedding: embeddingResponse.data[j].embedding,
          metadata: {
            id: documentId,
            department: metadata.department,
            category: metadata.category,
            subject: metadata.subject,
            version: metadata.version,
            chunk_index: i + j,
          },
          chunk_index: i + j,
        });
      }

      // Small delay to avoid rate limits
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error: any) {
      console.error(`Error generating embeddings for batch ${i / batchSize}:`, error);
      // Continue with other batches
    }
  }

  return embeddedChunks;
}

async function storeChunks(chunks: any[]): Promise<void> {
  // Process in batches to avoid overwhelming the database
  const batchSize = 20;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
    
    try {
      const { error } = await supabaseAdmin
        .from('document_chunks')
        .insert(batch.map(chunk => ({
          content: chunk.content,
          embedding: chunk.embedding,
          metadata: chunk.metadata,
          chunk_index: chunk.chunk_index,
        })));

      if (error) {
        console.error(`Error storing batch ${i / batchSize}:`, error);
      }

      // Small delay to avoid overwhelming the database
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error: any) {
      console.error(`Error in batch insert ${i / batchSize}:`, error);
      // Continue with other batches
    }
  }
}