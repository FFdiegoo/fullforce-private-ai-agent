import type { SupabaseClient } from '@supabase/supabase-js';
import { RetryableError } from './errors';
import { TextChunk } from './types';

type StoreOptions = {
  dryRun?: boolean;
};

export class VectorStore {
  private supabaseAdmin: SupabaseClient;

  constructor(supabaseAdmin: SupabaseClient) {
    this.supabaseAdmin = supabaseAdmin;
  }

  async storeChunks(chunks: TextChunk[], options: StoreOptions = {}): Promise<void> {
    const { dryRun } = options;
    const validChunks = chunks.filter((chunk) => {
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

    if (!validChunks.length) {
      console.warn('⚠️ No valid chunks to store');
      return;
    }

    const grouped = validChunks.reduce<Record<string, TextChunk[]>>((acc, chunk) => {
      if (!chunk.docId) return acc;
      acc[chunk.docId] = acc[chunk.docId] || [];
      acc[chunk.docId].push(chunk);
      return acc;
    }, {});

    for (const [docId, docChunks] of Object.entries(grouped)) {
      await this.storeChunksForDocument(docId, docChunks, dryRun);
    }
  }

  private async storeChunksForDocument(
    documentId: string,
    chunks: TextChunk[],
    dryRun?: boolean
  ): Promise<void> {
    const payload = chunks.map(({ content, embedding, chunk_index }) => ({
      doc_id: documentId,
      chunk_index,
      content,
      embedding,
    }));

    if (dryRun) {
      console.log(`💾 [dry-run] Skipping storage for ${payload.length} chunks of ${documentId}`);
      return;
    }

    const { error } = await this.supabaseAdmin
      .from('document_chunks')
      .upsert(payload, { onConflict: 'doc_id,chunk_index' });

    if (error) {
      const status = (error as any)?.status ?? (error as any)?.code;
      if (typeof status === 'number' && status >= 500) {
        throw new RetryableError('Supabase upsert failed', error);
      }
      throw error;
    }

    const maxIndex = chunks.length ? Math.max(...chunks.map((chunk) => chunk.chunk_index)) : -1;
    const cleanup = this.supabaseAdmin
      .from('document_chunks')
      .delete()
      .eq('doc_id', documentId)
      .gt('chunk_index', maxIndex);

    const { error: cleanupError } = await cleanup;
    if (cleanupError) {
      const status = (cleanupError as any)?.status ?? (cleanupError as any)?.code;
      if (typeof status === 'number' && status >= 500) {
        throw new RetryableError('Supabase cleanup failed', cleanupError);
      }
      console.error('⚠️ Cleanup error after upsert:', cleanupError);
    }
  }

  async searchSimilarDocuments(
    queryEmbedding: number[],
    originalQuery: string,
    threshold: number = 0.7,
    limit: number = 5
  ): Promise<any[]> {
    try {
      const { data, error } = await this.supabaseAdmin.rpc('match_documents', {
        query_embedding: queryEmbedding,
        similarity_threshold: threshold,
        match_count: limit,
      });

      if (error) {
        console.error('❌ Vector search error:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('❌ Error in similarity search:', error instanceof Error ? error.message : error);
      return await this.fallbackTextSearch(originalQuery, limit);
    }
  }

  private async fallbackTextSearch(query: string, limit: number): Promise<any[]> {
    try {
      let queryBuilder = this.supabaseAdmin
        .from('document_chunks')
        .select('doc_id, chunk_index, content');

      if (query && query.trim()) {
        queryBuilder = queryBuilder.textSearch('content', query);
      }

      const { data, error } = await queryBuilder.limit(limit);

      if (error) {
        console.error('❌ Text search error:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('❌ Fallback search error:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  async deleteChunksByDocumentId(documentId: string): Promise<void> {
    const { error } = await this.supabaseAdmin
      .from('document_chunks')
      .delete()
      .eq('doc_id', documentId);

    if (error) {
      throw error;
    }
  }
}