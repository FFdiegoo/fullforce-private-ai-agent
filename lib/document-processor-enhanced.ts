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
  embedding: number[];
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
    start_char: number;
    end_char: number;
  };
  chunk_index: number;
}

export interface ProcessingResult {
  success: boolean;
  documentId: string;
  filename: string;
  chunksCreated: number;
  error?: string;
  processingTime?: number;
}

export class EnhancedDocumentProcessor {
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
      console.log(`📝 Extracting text from ${filename} (${mimeType})`);

      if (mimeType === 'application/pdf' || filename.endsWith('.pdf')) {
        const parsed = await pdfParse(buffer);
        return parsed.text;
      } 
      
      if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || filename.endsWith('.docx')) {
        const parsed = await mammoth.extractRawText({ buffer });
        return parsed.value;
      } 
      
      if (mimeType === 'application/msword' || filename.endsWith('.doc')) {
        // Basic .doc support - convert to text
        return buffer.toString('utf8');
      } 
      
      if (mimeType === 'text/plain' || filename.endsWith('.txt')) {
        return buffer.toString('utf8');
      } 
      
      if (mimeType === 'text/markdown' || filename.endsWith('.md')) {
        return buffer.toString('utf8');
      } 
      
      if (mimeType === 'text/csv' || filename.endsWith('.csv')) {
        return buffer.toString('utf8');
      } 
      
      if (mimeType === 'application/rtf' || filename.endsWith('.rtf')) {
        const rtfText = buffer.toString('utf8');
        return rtfText.replace(/\\[a-z]+\d*\s?/g, '').replace(/[{}]/g, '');
      }

      // Fallback: try to extract as plain text
      const text = buffer.toString('utf8');
      const readableChars = text.match(/[\x20-\x7E\s]/g);
      
      if (readableChars && readableChars.length / text.length > 0.7) {
        return text;
      } else {
        throw new Error(`Unsupported file format: ${mimeType}`);
      }
    } catch (error) {
      console.error(`Error extracting text from ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Intelligent text chunking with overlap
   */
  chunkText(text: string, filename: string): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    console.log(`✂️ Chunking text from ${filename} (${text.length} characters)`);

    // Clean and normalize text
    const cleanText = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Split by sentences first for better chunk boundaries
    const sentences = cleanText.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let currentChunk = '';
    let currentLength = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.length;
      
      // If adding this sentence would exceed chunk size
      if (currentLength + sentenceLength > this.chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        
        // Start new chunk with overlap
        const overlapText = this.getOverlapText(currentChunk, this.chunkOverlap);
        currentChunk = overlapText + sentence;
        currentLength = currentChunk.length;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
        currentLength += sentenceLength + (currentChunk ? 1 : 0);
      }
    }

    // Add the last chunk if it has content
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    console.log(`📦 Created ${chunks.length} chunks from ${filename}`);
    return chunks.filter(chunk => chunk.length > 50); // Filter out very small chunks
  }

  /**
   * Get overlap text from the end of a chunk
   */
  private getOverlapText(text: string, overlapSize: number): string {
    if (text.length <= overlapSize) {
      return text + ' ';
    }
    
    // Try to find a good break point (sentence or word boundary)
    const overlapText = text.slice(-overlapSize);
    const lastSentence = overlapText.lastIndexOf('.');
    const lastSpace = overlapText.lastIndexOf(' ');
    
    if (lastSentence > overlapSize * 0.5) {
      return text.slice(-(text.length - text.lastIndexOf('.', text.length - overlapSize))) + ' ';
    } else if (lastSpace > overlapSize * 0.3) {
      return text.slice(-(text.length - text.lastIndexOf(' ', text.length - overlapSize))) + ' ';
    } else {
      return overlapText + ' ';
    }
  }

  /**
   * Generate embedding using OpenAI text-embedding-3-small
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Limit text to 8000 characters for embedding API
      const truncatedText = text.length > 8000 ? text.substring(0, 8000) : text;
      
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: truncatedText,
        encoding_format: 'float'
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data received from OpenAI API');
      }

      return response.data[0]!.embedding;
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
      console.log(`💾 Storing ${chunks.length} chunks in database`);

      const dbChunks = chunks.map(chunk => ({
        content: chunk.content,
        embedding: chunk.embedding,
        metadata: chunk.metadata,
        chunk_index: chunk.chunk_index,
        created_at: new Date().toISOString()
      }));

      // Insert chunks in batches to avoid payload size limits
      const batchSize = 50;
      for (let i = 0; i < dbChunks.length; i += batchSize) {
        const batch = dbChunks.slice(i, i + batchSize);
        
        const { error } = await this.supabase
          .from('document_chunks')
          .insert(batch);

        if (error) {
          throw new Error(`Failed to insert chunk batch: ${error.message}`);
        }

        console.log(`   Stored batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(dbChunks.length/batchSize)}`);
      }

      console.log(`✅ Successfully stored ${chunks.length} chunks`);
    } catch (error) {
      console.error('Error storing chunks:', error);
      throw error;
    }
  }

  /**
   * Mark document as processed
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
   * Mark document as failed
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
    const startTime = Date.now();
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
      const textChunks = this.chunkText(extractedText, document.filename);
      
      if (textChunks.length === 0) {
        throw new Error('No chunks created from extracted text');
      }

      console.log(`   📦 Created ${textChunks.length} chunks`);

      // Step 4: Generate embeddings
      console.log(`   🧠 Generating embeddings...`);
      const documentChunks: DocumentChunk[] = [];

      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        
        if (!chunk || chunk.trim().length === 0) {
          console.warn(`   ⚠️ Skipping empty chunk ${i}`);
          continue;
        }
        
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
              ...(document.afdeling && { afdeling: document.afdeling }),
              ...(document.categorie && { categorie: document.categorie }),
              ...(document.onderwerp && { onderwerp: document.onderwerp }),
              start_char: i * this.chunkSize,
              end_char: Math.min((i + 1) * this.chunkSize, extractedText.length)
            },
            chunk_index: i
          });

          // Rate limiting: small delay every 10 embeddings
          if (i > 0 && i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log(`   Progress: ${i + 1}/${textChunks.length} embeddings generated`);
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

      // Step 5: Store chunks
      console.log(`   💾 Storing chunks in database...`);
      await this.storeChunks(documentChunks);

      // Step 6: Mark as processed
      await this.markDocumentAsProcessed(document.id, documentChunks.length);

      const processingTime = Date.now() - startTime;
      console.log(`   ✅ Successfully processed ${document.filename} in ${processingTime}ms`);

      return {
        success: true,
        documentId: document.id,
        filename: document.filename,
        chunksCreated: documentChunks.length,
        processingTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`   ❌ Failed to process ${document.filename}: ${errorMessage}`);

      await this.markDocumentAsFailed(document.id, errorMessage);

      return {
        success: false,
        documentId: document.id,
        filename: document.filename,
        chunksCreated: 0,
        error: errorMessage,
        processingTime: Date.now() - startTime
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
    totalTime: number;
  }> {
    const startTime = Date.now();
    console.log(`🔍 Fetching up to ${limit} unprocessed documents...`);

    try {
      const documents = await this.getUnprocessedDocuments(limit);

      if (documents.length === 0) {
        console.log('✅ No documents to process');
        return {
          processed: 0,
          successful: 0,
          failed: 0,
          results: [],
          totalTime: 0
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
      const totalTime = Date.now() - startTime;

      console.log(`\n📊 Processing complete:`);
      console.log(`   Processed: ${results.length}`);
      console.log(`   Successful: ${successful}`);
      console.log(`   Failed: ${failed}`);
      console.log(`   Total time: ${totalTime}ms`);

      return {
        processed: results.length,
        successful,
        failed,
        results,
        totalTime
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
      console.log(`🔍 Testing vector search for: "${query}"`);

      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);

      // Search for similar documents using the match_documents function
      const { data, error } = await this.supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: limit
      });

      if (error) {
        throw new Error(`Vector search failed: ${error.message}`);
      }

      console.log(`✅ Found ${data?.length || 0} matching chunks`);
      return data || [];
    } catch (error) {
      console.error('Error in vector search test:', error);
      throw error;
    }
  }
}