import { SupabaseClient } from '@supabase/supabase-js';
import { DocumentProcessor } from './documentProcessor';
import { EmbeddingGenerator } from './embeddingGenerator';
import { VectorStore } from './vectorStore';
import { DocumentMetadata, ProcessingOptions } from './types';
import { RAG_CONFIG } from '@/lib/rag/config';


export class RAGPipeline {
  private supabase: SupabaseClient; // <-- voeg deze regel toe!
  private documentProcessor: DocumentProcessor;
  private embeddingGenerator: EmbeddingGenerator;
  private vectorStore: VectorStore;

  constructor(supabaseClient: SupabaseClient, openAIKey: string) {
    this.supabase = supabaseClient; // <-- voeg deze regel toe!
    this.documentProcessor = new DocumentProcessor(supabaseClient);
    this.embeddingGenerator = new EmbeddingGenerator(openAIKey);
    this.vectorStore = new VectorStore(supabaseClient);
  }

  async processDocument(metadata: DocumentMetadata, options: ProcessingOptions): Promise<void> {
    try {
      // Step 1: Process document and create chunks
      const chunks = await this.documentProcessor.processDocument(metadata, options);

      // Step 2: Generate embeddings for chunks
     const embeddedChunks = await this.embeddingGenerator.generateEmbeddings(chunks, RAG_CONFIG.embeddingModel);

      // Step 3: Store chunks with embeddings in vector store
      await this.vectorStore.storeChunks(embeddedChunks);

      // Update document status
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
}