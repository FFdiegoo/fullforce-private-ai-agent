import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export interface DocumentMetadata {
  id: string;
  filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  afdeling?: string;
  categorie?: string;
  onderwerp?: string;
  processed: boolean;
  ready_for_indexing: boolean;
}

export interface DocumentChunk {
  content: string;
  embedding?: number[];
  metadata: {
    id: string;
    filename: string;
    chunk_index: number;
    total_chunks: number;
    file_size: number;
    mime_type: string;
    afdeling?: string;
    categorie?: string;
    onderwerp?: string;
  };
  chunk_index: number;
}

export interface ProcessingResult {
  success: boolean;
  documentId: string;
  filename: string;
  chunksCreated: number;
  error?: string;
}

export class DocumentProcessor {
  private supabase: any;
  private openai: OpenAI;
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(
    supabaseUrl: string,
    supabaseServiceKey: string,
    openaiApiKey: string,
    options: {
      chunkSize?: number;
      chunkOverlap?: number;
    } = {}
  ) {
    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    this.openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    this.chunkSize = options.chunkSize || 1000;
    this.chunkOverlap = options.chunkOverlap || 200;
  }

  /**
   * Get unprocessed documents from Supabase
   */
  async getUnprocessedDocuments(limit: number = 10): Promise<DocumentMetadata[]> {
    try {
      const { data, error } = await this.supabase
        .from('documents_metadata')
        .select('*')
        .eq('ready_for_indexing', true)
        .eq('processed', false)
        .order('last_updated', { ascending: true })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to fetch documents: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching unprocessed documents:', error);
      throw error;
    }
  }

  /**
   * Download file from Supabase Storage
   */
  async downloadFile(storagePath: string): Promise<Buffer> {
    try {
      // Normalize storage path (remove leading slash if present)
      const normalizedPath = storagePath.startsWith('/') 
        ? storagePath.substring(1) 
        : storagePath;

      const { data, error } = await this.supabase.storage
        .from('company-docs')
        .download(normalizedPath);

      if (error) {
        throw new Error(`Download failed: ${error.message}`);
      }

      if (!data) {
        throw new Error('No file data received from Supabase');
      }

      // Convert Blob to Buffer
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error(`Error downloading file ${storagePath}:`, error);
      throw error;
    }
  }

  /**
   * Extract text from various file formats
   */
  async extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
    try {
      if (mimeType === 'application/pdf' || filename.endsWith('.pdf')) {
        const parsed = await pdfParse(buffer);
        return parsed.text;
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        filename.endsWith('.docx')
      ) {
        const parsed = await mammoth.extractRawText({ buffer });
        return parsed.value;
      } else if (
        mimeType === 'application/msword' ||
        filename.endsWith('.doc')
      ) {
        // For .doc files, try to extract as text (limited support)
        return buffer.toString('utf8');
      } else if (mimeType === 'text/plain' || filename.endsWith('.txt')) {
        return buffer.toString('utf8');
      } else if (mimeType === 'text/csv' || filename.endsWith('.csv')) {
        return buffer.toString('utf8');
      } else if (mimeType === 'application/rtf' || filename.endsWith('.rtf')) {
        // Basic RTF text extraction (remove RTF formatting)
        const rtfText = buffer.toString('utf8');
        return rtfText.replace(/\\[a-z]+\d*\s?/g, '').replace(/[{}]/g, '');
      } else {
        // Try to extract as plain text for other formats
        const text = buffer.toString('utf8');
        
        // Check if it's readable text (not binary)
        const readableChars = text.match(/[\x20-\x7E\s]/g);
        if (readableChars && readableChars.length / text.length > 0.7) {
          return text;
        } else {
          throw new Error(`Unsupported file format: ${mimeType}`);
        }
      }
    } catch (error) {
      console.error(`Error extracting text from ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Split text into chunks with overlap
   */
  chunkText(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const chunks: string[] = [];
    const words = text.split(/\s+/);
    
    if (words.length <= this.chunkSize) {
      return [text];
    }

    for (let i = 0; i < words.length; i += this.chunkSize - this.chunkOverlap) {
      const chunk = words.slice(i, i + this.chunkSize).join(' ');
      if (chunk.trim().length > 0) {
        chunks.push(chunk.trim());
      }
      
      // Break if we've reached the end
      if (i + this.chunkSize >= words.length) {
        break;
      }
    }

    return chunks;
  }

  /**
   * Generate embedding for text using OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.substring(0, 8000), // Limit to 8000 characters for embedding
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data received from OpenAI API');
      }

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Store document chunks with embeddings in Supabase
   */
  async storeChunks(chunks: DocumentChunk[]): Promise<void> {
    try {
      // Prepare chunks for database insertion
      const dbChunks = chunks.map(chunk => ({
        content: chunk.content,
        embedding: chunk.embedding,
        metadata: chunk.metadata,
        chunk_index: chunk.chunk_index,
        created_at: new Date().toISOString()
      }));

      // Insert chunks in batches to avoid payload size limits
      const batchSize = 100;
      for (let i = 0; i < dbChunks.length; i += batchSize) {
        const batch = dbChunks.slice(i, i + batchSize);
        
        const { error } = await this.supabase
          .from('document_chunks')
          .insert(batch);

        if (error) {
          throw new Error(`Failed to insert chunk batch: ${error.message}`);
        }
      }

      console.log(`✅ Stored ${chunks.length} chunks in database`);
    } catch (error) {
      console.error('Error storing chunks:', error);
      throw error;
    }
  }

  /**
   * Mark document as processed in metadata table
   */
  async markDocumentAsProcessed(documentId: string, chunkCount: number): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('documents_metadata')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          chunk_count: chunkCount,
          last_error: null
        })
        .eq('id', documentId);

      if (error) {
        throw new Error(`Failed to mark document as processed: ${error.message}`);
      }
    } catch (error) {
      console.error('Error marking document as processed:', error);
      throw error;
    }
  }

  /**
   * Mark document as failed with error message
   */
  async markDocumentAsFailed(documentId: string, errorMessage: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('documents_metadata')
        .update({
          processed_at: new Date().toISOString(),
          last_error: errorMessage
        })
        .eq('id', documentId);

      if (error) {
        console.error('Failed to mark document as failed:', error);
      }
    } catch (error) {
      console.error('Error marking document as failed:', error);
    }
  }

  /**
   * Process a single document: download, extract, chunk, embed, store
   */
  async processDocument(document: DocumentMetadata): Promise<ProcessingResult> {
    console.log(`📄 Processing: ${document.filename}`);

    try {
      // Step 1: Download file
      console.log(`   📥 Downloading from: ${document.storage_path}`);
      const fileBuffer = await this.downloadFile(document.storage_path);

      // Step 2: Extract text
      console.log(`   📝 Extracting text...`);
      const extractedText = await this.extractText(
        fileBuffer, 
        document.mime_type, 
        document.filename
      );

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text content extracted from file');
      }

      console.log(`   📊 Extracted ${extractedText.length} characters`);

      // Step 3: Chunk text
      console.log(`   ✂️ Chunking text...`);
      const textChunks = this.chunkText(extractedText);
      
      if (textChunks.length === 0) {
        throw new Error('No chunks created from extracted text');
      }

      console.log(`   📦 Created ${textChunks.length} chunks`);

      // Step 4: Generate embeddings and prepare chunks
      console.log(`   🧠 Generating embeddings...`);
      const documentChunks: DocumentChunk[] = [];

      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        
        try {
          const embedding = await this.generateEmbedding(chunk);
          
          documentChunks.push({
            content: chunk,
            embedding,
            metadata: {
              id: document.id,
              filename: document.filename,
              chunk_index: i,
              total_chunks: textChunks.length,
              file_size: document.file_size,
              mime_type: document.mime_type,
              afdeling: document.afdeling,
              categorie: document.categorie,
              onderwerp: document.onderwerp
            },
            chunk_index: i
          });

          // Add small delay to avoid rate limiting
          if (i > 0 && i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (embeddingError) {
          console.warn(`   ⚠️ Failed to generate embedding for chunk ${i}: ${embeddingError}`);
          // Continue with other chunks
        }
      }

      if (documentChunks.length === 0) {
        throw new Error('No embeddings generated for any chunks');
      }

      console.log(`   ✅ Generated ${documentChunks.length} embeddings`);

      // Step 5: Store chunks in database
      console.log(`   💾 Storing chunks in database...`);
      await this.storeChunks(documentChunks);

      // Step 6: Mark document as processed
      await this.markDocumentAsProcessed(document.id, documentChunks.length);

      console.log(`   ✅ Successfully processed ${document.filename}`);

      return {
        success: true,
        documentId: document.id,
        filename: document.filename,
        chunksCreated: documentChunks.length
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`   ❌ Failed to process ${document.filename}: ${errorMessage}`);

      // Mark document as failed
      await this.markDocumentAsFailed(document.id, errorMessage);

      return {
        success: false,
        documentId: document.id,
        filename: document.filename,
        chunksCreated: 0,
        error: errorMessage
      };
    }
  }

  /**
   * Process multiple documents
   */
  async processDocuments(limit: number = 10): Promise<{
    processed: number;
    successful: number;
    failed: number;
    results: ProcessingResult[];
  }> {
    console.log(`🔍 Fetching up to ${limit} unprocessed documents...`);

    try {
      const documents = await this.getUnprocessedDocuments(limit);

      if (documents.length === 0) {
        console.log('✅ No documents to process');
        return {
          processed: 0,
          successful: 0,
          failed: 0,
          results: []
        };
      }

      console.log(`📋 Found ${documents.length} documents to process`);

      const results: ProcessingResult[] = [];

      // Process documents sequentially to avoid overwhelming the system
      for (const document of documents) {
        const result = await this.processDocument(document);
        results.push(result);
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;

      console.log(`\n📊 Processing complete:`);
      console.log(`   Processed: ${results.length}`);
      console.log(`   Successful: ${successful}`);
      console.log(`   Failed: ${failed}`);

      return {
        processed: results.length,
        successful,
        failed,
        results
      };

    } catch (error) {
      console.error('Error in processDocuments:', error);
      throw error;
    }
  }

  /**
   * Test vector search functionality
   */
  async testVectorSearch(query: string, limit: number = 5): Promise<any[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);

      // Search for similar documents
      const { data, error } = await this.supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: limit
      });

      if (error) {
        throw new Error(`Vector search failed: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error in vector search test:', error);
      throw error;
    }
  }
}