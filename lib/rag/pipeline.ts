import type { SupabaseClient } from '@supabase/supabase-js';
import { DocumentProcessor } from './documentProcessor';
import { EmbeddingGenerator } from './embeddingGenerator';
import { VectorStore } from './vectorStore';
import { DocumentMetadata, ProcessingOptions } from './types';
import { RAG_CONFIG } from '@/lib/rag/config';

export class RAGPipeline {
  private supabaseAdmin: SupabaseClient;
  private documentProcessor: DocumentProcessor;
  private embeddingGenerator: EmbeddingGenerator;
  private vectorStore: VectorStore;

  constructor(supabaseAdmin: SupabaseClient, openAIKey: string) {
    this.supabaseAdmin = supabaseAdmin;
    this.documentProcessor = new DocumentProcessor(supabaseAdmin);
    this.embeddingGenerator = new EmbeddingGenerator(openAIKey);
    this.vectorStore = new VectorStore(supabaseAdmin);
  }

  async processDocument(metadata: DocumentMetadata, options: ProcessingOptions): Promise<void> {
    try {
      console.log(`🔄 Starting RAG pipeline for document: ${metadata.filename}`);
      
      // Step 1: Process document and create chunks
      console.log('📄 Processing document and creating chunks...');
      const rawChunks = await this.documentProcessor.processDocument(metadata, options);
      console.log(`✅ Created ${rawChunks.length} chunks`);

      // Step 2: Generate embeddings for chunks
      console.log('🧠 Generating embeddings for chunks...');
      const embeddedChunks = await this.embeddingGenerator.generateEmbeddings(
        rawChunks,
        RAG_CONFIG.embeddingModel
      );
      console.log(`✅ Generated ${embeddedChunks.length} embeddings`);

      // Step 3: Store chunks with embeddings in vector store
      console.log('💾 Storing chunks with embeddings...');
      await this.vectorStore.storeChunks(embeddedChunks);
      console.log(`✅ Stored ${embeddedChunks.length} chunks in vector store`);

      // Step 4: Mark as processed
      console.log('✅ Document processing complete');
      await this.updateDocumentStatus(metadata.id, true);
    } catch (error) {
      console.error(
        `❌ Error in RAG pipeline for document ${metadata.filename}:`,
        error
      );
      await this.updateDocumentStatus(metadata.id, false);
      throw error;
    }
  }

  private async updateDocumentStatus(documentId: string, success: boolean): Promise<void> {
    try {
      const { error } = await this.supabaseAdmin
        .from('documents_metadata')
        .update({ 
          processed: success, 
          processed_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      if (error) {
        console.error('❌ Error updating document status:', error);
      }
    } catch (error) {
      console.error('❌ Error in updateDocumentStatus:', error);
    }
  }

  async searchSimilarDocuments(query: string): Promise<any[]> {
    try {
      console.log(`🔍 Searching for documents similar to: "${query.substring(0, 50)}..."`);
      
      // Generate embedding for query
      const embeddingResponse = await this.embeddingGenerator.generateEmbeddings(
        [{ content: query, metadata: {} as DocumentMetadata, chunk_index: 0 }],
        RAG_CONFIG.embeddingModel
      );

      if (embeddingResponse.length === 0 || !embeddingResponse[0].embedding) {
        throw new Error('Failed to generate query embedding');
      }

      // Search for similar documents
      const results = await this.vectorStore.searchSimilarDocuments(
        embeddingResponse[0].embedding,
        RAG_CONFIG.similarityThreshold,
        RAG_CONFIG.maxResults
      );
      
      console.log(`✅ Found ${results.length} similar documents`);
      return results;
    } catch (error) {
      console.error('❌ Error searching similar documents:', error);
      return [];
    }
  }
}