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
    limit: number = 5,
    filter?: { afdeling?: string, categorie?: string, klant_id?: string }
  ): Promise<any[]> {
    try {
      console.log(`🔍 Searching for similar documents with threshold ${threshold}, limit ${limit}${filter ? ', and filters' : ''}...`);
      
      // Build the filter conditions if provided
      let filterConditions = '';
      const filterParams: any = {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit
      };
      
      if (filter) {
        // Add each filter condition if it exists
        if (filter.afdeling) {
          filterConditions += " AND metadata->>'afdeling' = :afdeling";
          filterParams.afdeling = filter.afdeling;
        }
        
        if (filter.categorie) {
          filterConditions += " AND metadata->>'categorie' = :categorie";
          filterParams.categorie = filter.categorie;
        }
        
        if (filter.klant_id) {
          filterConditions += " AND metadata->>'klant_id' = :klant_id";
          filterParams.klant_id = filter.klant_id;
        }
        
        console.log(`🔍 Applied filters: ${JSON.stringify(filter)}`);
      }
      
      // If we have filters, we need to use a custom query instead of the match_documents function
      let data, error;
      
      if (filterConditions) {
        // Custom query with filters
        const query = `
          SELECT
            id,
            content,
            metadata,
            1 - (embedding <=> :query_embedding) AS similarity
          FROM document_chunks
          WHERE 1 - (embedding <=> :query_embedding) > :match_threshold
          ${filterConditions}
          ORDER BY embedding <=> :query_embedding
          LIMIT :match_count
        `;
        
        const result = await this.supabase.rpc('sql', { query, params: filterParams });
        data = result.data;
        error = result.error;
      } else {
        // Use the standard match_documents function when no filters
        const result = await this.supabase.rpc('match_documents', {
          query_embedding: queryEmbedding,
          match_threshold: threshold,
          match_count: limit
        });
        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error('❌ Vector search error:', error);
        throw error;
      }

      console.log(`✅ Found ${data?.length || 0} similar documents`);
      return data || [];
    } catch (error) {
      console.error('❌ Error in similarity search:', error instanceof Error ? error.message : error);
      
      // Fallback to text search if vector search fails
      return await this.fallbackTextSearch('', limit, filter);
    }
  }

  private async fallbackTextSearch(
    query: string, 
    limit: number,
    filter?: { afdeling?: string, categorie?: string, klant_id?: string }
  ): Promise<any[]> {
    try {
      console.log(`🔍 Falling back to text search with limit ${limit}${filter ? ' and filters' : ''}...`);
      
      // Start building the query
      let queryBuilder = this.supabase
        .from('document_chunks')
        .select('*');
      
      // Apply text search if query is provided
      if (query && query.trim()) {
        queryBuilder = queryBuilder.textSearch('content', query);
      }
      
      // Apply metadata filters if provided
      if (filter) {
        if (filter.afdeling) {
          queryBuilder = queryBuilder.filter('metadata->afdeling', 'eq', filter.afdeling);
        }
        
        if (filter.categorie) {
          queryBuilder = queryBuilder.filter('metadata->categorie', 'eq', filter.categorie);
        }
        
        if (filter.klant_id) {
          queryBuilder = queryBuilder.filter('metadata->klant_id', 'eq', filter.klant_id);
        }
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