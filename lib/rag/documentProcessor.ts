import { SupabaseClient } from '@supabase/supabase-js';
import { DocumentMetadata, TextChunk, ProcessingOptions } from './types';

export class DocumentProcessor {
  private supabase: SupabaseClient;
  
  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  async processDocument(metadata: DocumentMetadata, options: ProcessingOptions): Promise<TextChunk[]> {
    try {
      // Download document from Supabase Storage
      const { data, error } = await this.supabase
        .storage
        .from('company-docs')
        .download(metadata.storage_path);

      if (error) throw error;

      // Convert blob to text
      const text = await data.text();

      // Split into chunks
      const chunks = this.createChunks(text, options.chunkSize, options.chunkOverlap);

      // Create TextChunk objects with metadata
      return chunks.map((content, index) => ({
        content,
        metadata,
        chunk_index: index,
      }));
    } catch (error) {
      console.error(`Error processing document ${metadata.filename}:`, error);
      throw error;
    }
  }

  private createChunks(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?]+\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        // Keep the overlap from the previous chunk
        currentChunk = currentChunk.slice(-overlap) + ' ' + sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}