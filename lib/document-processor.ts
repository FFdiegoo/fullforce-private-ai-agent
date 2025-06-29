import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export interface DocumentChunk {
  content: string;
  metadata: {
    source: string;
    page?: number;
    section?: string;
    title?: string;
  };
  embedding?: number[];
}

export class DocumentProcessor {
  private static readonly CHUNK_SIZE = 1000;
  private static readonly CHUNK_OVERLAP = 200;

  static async processDocument(
    filePath: string,
    content: string,
    metadata: any = {}
  ): Promise<void> {
    try {
      console.log(`Processing document: ${filePath}`);
      
      // Create chunks
      const chunks = this.createChunks(content, {
        source: filePath,
        ...metadata
      });

      // Process chunks in batches
      const batchSize = 10;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        await this.processBatch(batch);
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`Successfully processed ${chunks.length} chunks from ${filePath}`);
    } catch (error) {
      console.error(`Error processing document ${filePath}:`, error);
      throw error;
    }
  }

  private static async processBatch(chunks: DocumentChunk[]): Promise<void> {
    try {
      // Generate embeddings for all chunks in batch
      const contents = chunks.map(chunk => chunk.content);
      const embeddings = await this.generateEmbeddings(contents);

      // Store chunks with embeddings
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];

        await this.storeChunk(chunk, embedding);
      }
    } catch (error) {
      console.error('Error processing batch:', error);
      throw error;
    }
  }

  private static async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: texts,
      });

      return response.data.map(item => item.embedding);
    } catch (error) {
      console.error('Error generating embeddings:', error);
      throw error;
    }
  }

  private static async storeChunk(chunk: DocumentChunk, embedding: number[]): Promise<void> {
    try {
      const { error } = await supabase
        .from('document_chunks')
        .insert({
          content: chunk.content,
          metadata: chunk.metadata,
          embedding: embedding,
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Error storing chunk:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in storeChunk:', error);
      throw error;
    }
  }

  static createChunks(text: string, metadata: any): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    let currentLength = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.trim().length;
      
      if (currentLength + sentenceLength > this.CHUNK_SIZE && currentChunk) {
        // Save current chunk
        chunks.push({
          content: currentChunk.trim(),
          metadata: { ...metadata, chunk_index: chunks.length }
        });
        
        // Start new chunk with overlap
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(this.CHUNK_OVERLAP / 5));
        currentChunk = overlapWords.join(' ') + ' ' + sentence.trim();
        currentLength = currentChunk.length;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence.trim();
        currentLength = currentChunk.length;
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: { ...metadata, chunk_index: chunks.length }
      });
    }

    return chunks;
  }

  static async searchSimilarChunks(
    query: string,
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<any[]> {
    try {
      // Generate embedding for query
      const queryEmbedding = await this.generateEmbeddings([query]);
      const embedding = queryEmbedding[0];

      // Use vector similarity search
      const { data, error } = await supabase.rpc('match_documents', {
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: limit
      });

      if (error) {
        console.error('Vector search error:', error);
        // Fallback to text search
        return await this.fallbackTextSearch(query, limit);
      }

      return data || [];
    } catch (error) {
      console.error('Error in similarity search:', error);
      // Fallback to text search
      return await this.fallbackTextSearch(query, limit);
    }
  }

  private static async fallbackTextSearch(query: string, limit: number): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('document_chunks')
        .select('*')
        .textSearch('content', query)
        .limit(limit);

      if (error) {
        console.error('Text search error:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Fallback search error:', error);
      return [];
    }
  }

  static async processDirectory(directoryPath: string): Promise<void> {
    try {
      const files = await this.getAllFiles(directoryPath);
      console.log(`Found ${files.length} files to process`);

      for (const file of files) {
        try {
          const content = await fs.promises.readFile(file, 'utf-8');
          const relativePath = path.relative(directoryPath, file);
          
          await this.processDocument(relativePath, content, {
            file_path: file,
            file_name: path.basename(file),
            directory: path.dirname(relativePath)
          });
        } catch (fileError) {
          console.error(`Error processing file ${file}:`, fileError);
          // Continue with other files
        }
      }

      console.log('Directory processing completed');
    } catch (error) {
      console.error('Error processing directory:', error);
      throw error;
    }
  }

  private static async getAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively process subdirectories
          const subFiles = await this.getAllFiles(fullPath);
          files.push(...subFiles);
        } else if (this.isSupportedFile(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error);
    }
    
    return files;
  }

  private static isSupportedFile(filename: string): boolean {
    const supportedExtensions = ['.txt', '.md', '.pdf', '.doc', '.docx'];
    const ext = path.extname(filename).toLowerCase();
    return supportedExtensions.includes(ext);
  }
}