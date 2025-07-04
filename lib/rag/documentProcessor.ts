import { SupabaseClient } from '@supabase/supabase-js';
import { DocumentMetadata, TextChunk, ProcessingOptions } from './types';

export class DocumentProcessor {
  private supabase: SupabaseClient;
  
  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  async processDocument(metadata: DocumentMetadata, options: ProcessingOptions): Promise<TextChunk[]> {
    try {
      console.log(`🔍 Processing document: ${metadata.filename}`);
      
      // Check if we already have extracted text from the API
      let text: string;
      
      if ('extractedText' in metadata && metadata.extractedText) {
        // Use the pre-extracted text from the API
        text = metadata.extractedText;
        console.log(`✅ Using pre-extracted text (${text.length} characters)`);
      } else {
        // Fall back to downloading and extracting text (legacy method)
        console.log(`📥 Downloading document from ${metadata.storage_path}...`);
        const { data, error } = await this.supabase
          .storage
          .from('company-docs')
          .download(metadata.storage_path);

        if (error) {
          console.error(`❌ Error downloading document: ${error.message}`);
          throw error;
        }

        // Convert blob to text
        text = await data.text();
        console.log(`✅ Downloaded and extracted ${text.length} characters`);
      }

      // Split into chunks
      const chunks = this.createChunks(text, options.chunkSize, options.chunkOverlap);
      console.log(`✅ Created ${chunks.length} chunks`);

      // Create TextChunk objects with metadata
      return chunks.map((content, index) => ({
        content,
        metadata: {
          id: metadata.id,
          filename: metadata.filename,
          storage_path: metadata.storage_path,
          afdeling: metadata.afdeling,
          categorie: metadata.categorie,
          onderwerp: metadata.onderwerp,
          versie: metadata.versie
        },
        chunk_index: index,
      }));
    } catch (error) {
      console.error(`❌ Error processing document ${metadata.filename}:`, error);
      throw error;
    }
  }

  private createChunks(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    
    // Handle empty or very short text
    if (!text || text.length < chunkSize / 2) {
      if (text && text.trim()) {
        chunks.push(text.trim());
      }
      return chunks;
    }
    
    // Split by sentences for better semantic chunks
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      // If adding this sentence would exceed chunk size and we already have content
      if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        // Keep the overlap from the previous chunk
        const words = currentChunk.split(/\s+/);
        const overlapWords = words.slice(-Math.ceil(overlap / 10)); // Approximate word count for overlap
        currentChunk = overlapWords.join(' ') + ' ' + sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    // Add the last chunk if it has content
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}