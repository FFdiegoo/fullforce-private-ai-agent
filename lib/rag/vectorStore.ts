import { SupabaseClient } from '@supabase/supabase-js';
import { TextChunk } from './types';

export class VectorStore {
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  async storeChunks(chunks: TextChunk[]): Promise<void> {
    console.log(`🔄 Storing ${chunks.length} chunks in vector store...`);
    
    for (const chunk of chunks) {
      if (!chunk.embedding) {
        console.warn(`⚠️ Chunk ${chunk.chunk_index} skipped: no embedding`);
        continue;
      }

      try {
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
      } catch (error) {
        console.error(`❌ Error in storeChunks for chunk ${chunk.chunk_index}:`, error);
        throw error;
      }
    }
    
    console.log(`✅ Successfully stored ${chunks.length} chunks`);
  }

  async searchSimilarDocuments(
    queryEmbedding: number[],
    threshold: number = 0.7,
    limit: number = 5
  ): Promise<any[]> {
    try {
      console.log(`🔍 Searching for similar documents with threshold ${threshold}, limit ${limit}...`);
      
      const { data, error } = await this.supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit
      });

      if (error) {
        console.error('❌ Vector search error:', error);
        throw error;
      }

      console.log(`✅ Found ${data?.length || 0} similar documents`);
      return data || [];
    } catch (error) {
      console.error('❌ Error in similarity search:', error);
      
      // Fallback to text search if vector search fails
      return await this.fallbackTextSearch('', limit);
    }
  }

  private async fallbackTextSearch(query: string, limit: number): Promise<any[]> {
    try {
      console.log(`🔍 Falling back to text search with limit ${limit}...`);
      
      const { data, error } = await this.supabase
        .from('document_chunks')
        .select('*')
        .textSearch('content', query)
        .limit(limit);

      if (error) {
        console.error('❌ Text search error:', error);
        return [];
      }

      console.log(`✅ Found ${data?.length || 0} documents via text search`);
      return data || [];
    } catch (error) {
      console.error('❌ Fallback search error:', error);
      return [];
    }
  }

  async deleteChunksByDocumentId(documentId: string): Promise<void> {
    try {
      console.log(`🗑️ Deleting chunks for document ${documentId}...`);
      
      const { error } = await this.supabase
        .from('document_chunks')
        .delete()
        .eq('metadata->id', documentId);

      if (error) {
        console.error(`❌ Error deleting chunks for document ${documentId}:`, error);
        throw error;
      }
      
      console.log(`✅ Successfully deleted chunks for document ${documentId}`);
    } catch (error) {
      console.error(`❌ Error in deleteChunksByDocumentId:`, error);
      throw error;
    }
  }
}