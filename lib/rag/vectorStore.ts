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

  async searchSimilarDocuments(
    queryEmbedding: number[],
    threshold: number = 0.7,
    limit: number = 5
  ): Promise<any[]> {
    try {
      const { data, error } = await this.supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit
      });

      if (error) {
        console.error('Vector search error:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in similarity search:', error);
      
      // Fallback to text search if vector search fails
      return await this.fallbackTextSearch('', limit);
    }
  }

  private async fallbackTextSearch(query: string, limit: number): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
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

  async deleteChunksByDocumentId(documentId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('document_chunks')
        .delete()
        .eq('metadata->id', documentId);

      if (error) {
        console.error(`Error deleting chunks for document ${documentId}:`, error);
        throw error;
      }
    } catch (error) {
      console.error(`Error in deleteChunksByDocumentId:`, error);
      throw error;
    }
  }
}