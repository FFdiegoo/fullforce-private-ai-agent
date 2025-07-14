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
      
      let text: string;
      
      if ('extractedText' in metadata && metadata.extractedText) {
        text = metadata.extractedText;
        console.log(`✅ Using pre-extracted text (${text.length} characters)`);
      } else {
        console.log(`📥 Downloading document from ${metadata.storage_path}...`);
        
        const normalizedPath = this.validateAndNormalizePath(metadata.storage_path);
        console.log(`📁 Normalized storage path: ${normalizedPath}`);
        
        const fileData = await this.downloadWithRetry(normalizedPath);
        
        if (!fileData) throw new Error('Download returned null/undefined data');

        try {
          text = await fileData.text();
          console.log(`✅ Downloaded and extracted ${text.length} characters`);
        } catch (textError) {
          const err = textError as Error;
          throw new Error(`Failed to convert file data to text: ${err.message}`);
        }
      }

      if (!text || text.trim().length === 0) {
        throw new Error('No text content found in document');
      }

      const chunks = this.createChunks(text, options.chunkSize, options.chunkOverlap);
      console.log(`✅ Created ${chunks.length} chunks from ${text.length} characters`);

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
      const err = error as Error;
      console.error(`❌ Error processing document ${metadata.filename}:`, {
        error: err.message,
        stack: err.stack,
        storagePath: metadata.storage_path
      });
      throw error;
    }
  }

  private validateAndNormalizePath(storagePath: string): string {
    if (!storagePath || storagePath.trim() === '') {
      throw new Error('Invalid storage path: empty or undefined');
    }

    const normalizedPath = storagePath.startsWith('/') 
      ? storagePath.substring(1) 
      : storagePath;

    if (normalizedPath.includes('..') || normalizedPath.includes('//')) {
      throw new Error('Invalid storage path: contains invalid characters');
    }

    if (normalizedPath.length === 0) {
      throw new Error('Invalid storage path: empty after normalization');
    }

    return normalizedPath;
  }

  private async downloadWithRetry(storagePath: string, maxRetries = 3): Promise<Blob> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📥 Download attempt ${attempt}/${maxRetries}: ${storagePath}`);
        
        const { data, error } = await this.supabase
          .storage
          .from('company-docs')
          .download(storagePath);

        if (error) {
          const errorMessage = error.message || JSON.stringify(error);

          if (attempt === maxRetries) {
            throw new Error(`Download failed after ${maxRetries} attempts: ${errorMessage}`);
          }

          console.warn(`⚠️ Download attempt ${attempt} failed, retrying...`, {
            error,
            errorMessage,
            storagePath
          });

          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        if (!data) {
          if (attempt === maxRetries) {
            throw new Error(`Download returned null data after ${maxRetries} attempts`);
          }
          console.warn(`⚠️ Download attempt ${attempt} returned null data, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        console.log(`✅ Download successful on attempt ${attempt}: ${data.size} bytes, type: ${data.type}`);
        return data;

      } catch (error) {
        const err = error as Error;
        if (attempt === maxRetries) {
          throw new Error(`Download exception after ${maxRetries} attempts: ${err.message}`);
        }
        console.warn(`⚠️ Download attempt ${attempt} failed with exception, retrying...`, err.message);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw new Error('Download failed: unexpected end of retry loop');
  }

  private createChunks(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    
    if (!text || text.length < chunkSize / 2) {
      if (text && text.trim()) {
        chunks.push(text.trim());
      }
      return chunks;
    }
    
    const cleanedText = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const sentences = cleanedText.split(/(?<=[.!?])\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      if ((currentChunk + ' ' + trimmedSentence).length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());

        const words = currentChunk.split(/\s+/);
        const overlapWords = Math.max(1, Math.ceil(overlap / 10));
        const overlapText = words.slice(-overlapWords).join(' ');
        
        currentChunk = overlapText + ' ' + trimmedSentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    if (chunks.length === 0 && cleanedText.trim()) {
      chunks.push(cleanedText.trim());
    }

    const avgChunkSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length;
    console.log(`📊 Chunk statistics: ${chunks.length} chunks, avg size: ${Math.round(avgChunkSize)} chars`);

    return chunks;
  }
}
