import type { SupabaseClient } from '@supabase/supabase-js';
import { TextChunk } from './types';

const BATCH_SIZE = 50;

export class VectorStore {
  private supabaseAdmin: SupabaseClient;

  constructor(supabaseAdmin: SupabaseClient) {
    this.supabaseAdmin = supabaseAdmin;
  }

  async storeChunks(chunks: TextChunk[]): Promise<void> {
    const validChunks = chunks.filter(chunk => {
      if (!chunk.embedding) {
        console.warn(`⚠️ Chunk ${chunk.chunk_index} skipped: no embedding`);
        return false;
      }
      if (!chunk.docId) {
        console.warn(`⚠️ Chunk ${chunk.chunk_index} skipped: missing docId`);
        return false;
      }
      return true;
    });

    console.log(`🔄 Storing ${validChunks.length} chunks in vector store...`);

    const failedBatches: number[] = [];

    for (let i = 0; i < validChunks.length; i += BATCH_SIZE) {
      const batch = validChunks
        .slice(i, i + BATCH_SIZE)
        .map(({ content, embedding, docId, chunk_index }) => ({
          content,
          embedding,
          doc_id: docId,
          chunk_index,
        }));

      try {
        const { error } = await this.supabaseAdmin
          .from('document_chunks')
          .insert(batch);

        if (error) {
          throw error;
        }
      } catch (error) {
        console.error(`❌ Error storing batch starting at index ${i}:`, error);
        failedBatches.push(i);
        continue;
      }
    }

    if (failedBatches.length) {
      console.warn(`⚠️ Failed to store ${failedBatches.length} batch(es).`);
    } else {
      console.log(`✅ Successfully stored ${validChunks.length} chunks`);
    }
  }

  async searchSimilarDocuments(
    queryEmbedding: number[],
    originalQuery: string,
    threshold: number = 0.7,
    limit: number = 5
  ): Promise<any[]> {
    try {
      console.log(`🔍 Searching for similar documents with threshold ${threshold}, limit ${limit}...`);

      const { data, error } = await this.supabaseAdmin.rpc('match_documents', {
        query_embedding: queryEmbedding,
        similarity_threshold: threshold,
        match_count: limit
      });

      if (error) {
        console.error('❌ Vector search error:', error);
        throw error;
      }

      console.log(`✅ Found ${data?.length || 0} similar documents`);
      return data || [];
    } catch (error) {
      console.error('❌ Error in similarity search:', error instanceof Error ? error.message : error);
      
      // Fallback to text search if vector search fails
      return await this.fallbackTextSearch(originalQuery, limit);
    }
  }

  private async fallbackTextSearch(
    query: string,
    limit: number
  ): Promise<any[]> {
    try {
      console.log(`🔍 Falling back to text search with limit ${limit}...`);

      // Start building the query
      let queryBuilder = this.supabaseAdmin
        .from('document_chunks')
        .select('doc_id, chunk_index, content');

      // Apply text search if query is provided
      if (query && query.trim()) {
        queryBuilder = queryBuilder.textSearch('content', query);
      }

      // Apply limit and execute query
      const { data, error } = await queryBuilder.limit(limit);

      if (error) {
        console.error('❌ Text search error:', error);
        return [];
      }

      console.log(`✅ Found ${data?.length || 0} documents via text search`);
      return data || [];
    } catch (error) {
      console.error('❌ Fallback search error:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  async deleteChunksByDocumentId(documentId: string): Promise<void> {
    try {
      console.log(`🗑️ Deleting chunks for document ${documentId}...`);

      const { error } = await this.supabaseAdmin
        .from('document_chunks')
        .delete()
        .eq('doc_id', documentId);

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