import { SupabaseClient } from '@supabase/supabase-js';
import { DocumentProcessor } from './documentProcessor';
import { EmbeddingGenerator } from './embeddingGenerator';
import { VectorStore } from './vectorStore';
import { DocumentMetadata, ProcessingOptions } from './types';
import { RAG_CONFIG } from '@/lib/rag/config';

export class RAGPipeline {
  private supabase: SupabaseClient;
  private documentProcessor: DocumentProcessor;
  private embeddingGenerator: EmbeddingGenerator;
  private vectorStore: VectorStore;

  constructor(supabaseClient: SupabaseClient, openAIKey: string) {
    this.supabase = supabaseClient;
    this.documentProcessor = new DocumentProcessor(supabaseClient);
    this.embeddingGenerator = new EmbeddingGenerator(openAIKey);
    this.vectorStore = new VectorStore(supabaseClient);
  }

  async processDocument(metadata: DocumentMetadata, options: ProcessingOptions): Promise<void> {
    try {
      // Step 1: Process document and create chunks
      const rawChunks = await this.documentProcessor.processDocument(metadata, options);

      // Step 2: Generate embeddings for chunks
      const embeddedChunks = await this.embeddingGenerator.generateEmbeddings(
        rawChunks,
        RAG_CONFIG.embeddingModel
      );

      // Step 3: Store chunks with embeddings in vector store
      await this.vectorStore.storeChunks(embeddedChunks);

      // Step 4: Mark as processed
      await this.updateDocumentStatus(metadata.id, true);
    } catch (error) {
      console.error('Error in RAG pipeline:', error);
      await this.updateDocumentStatus(metadata.id, false);
      throw error;
    }
  }

  private async updateDocumentStatus(documentId: string, success: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('documents_metadata')
      .update({ 
        processed: success, 
        processed_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    if (error) {
      console.error('Error updating document status:', error);
    }
  }

  async searchSimilarDocuments(query: string): Promise<any[]> {
    try {
      // Generate embedding for query
      const embeddingResponse = await this.embeddingGenerator.generateEmbeddings(
        [{ content: query, metadata: {} as DocumentMetadata, chunk_index: 0 }],
        RAG_CONFIG.embeddingModel
      );

      if (embeddingResponse.length === 0 || !embeddingResponse[0].embedding) {
        throw new Error('Failed to generate query embedding');
      }

      // Search for similar documents
      return await this.vectorStore.searchSimilarDocuments(
        embeddingResponse[0].embedding,
        0.7,  // threshold
        5     // limit
      );
    } catch (error) {
      console.error('Error searching similar documents:', error);
      return [];
    }
  }
}