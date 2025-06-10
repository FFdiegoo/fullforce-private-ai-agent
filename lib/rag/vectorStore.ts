import { SupabaseClient } from '@supabase/supabase-js';
import { TextChunk } from './types';

export class VectorStore {
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  async storeChunks(chunks: TextChunk[]): Promise<void> {
    for (const chunk of chunks) {
      if (!chunk.embedding) {
        console.warn(`⚠️ Chunk ${chunk.chunk_index} skipped: no embedding`);
        continue;
      }

      const { error } = await this.supabase
        .from('document_chunks')
        .insert({
          content: chunk.content,
          embedding: chunk.embedding,
          metadata: chunk.metadata,
          chunk_index: chunk.chunk_index,
        });

      if (error) {
        console.error(`❌ Error storing chunk ${chunk.chunk_index}:`, error);
        throw error;
      }
    }
  }
}
