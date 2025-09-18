import type { SupabaseClient } from '@supabase/supabase-js';
import { DocumentProcessor } from './documentProcessor';
import { EmbeddingGenerator } from './embeddingGenerator';
import { RetryableError } from './errors';
import { RAG_CONFIG } from './config';
import type { DocumentMetadata, ProcessingOptions } from './types';
import { VectorStore } from './vectorStore';

type PipelineOptions = {
  dryRun?: boolean;
};

export class RAGPipeline {
  private documentProcessor: DocumentProcessor;
  private embeddingGenerator: EmbeddingGenerator;
  private vectorStore: VectorStore;

  constructor(supabaseAdmin: SupabaseClient, openAIKey: string) {
    this.documentProcessor = new DocumentProcessor();
    this.embeddingGenerator = new EmbeddingGenerator(openAIKey);
    this.vectorStore = new VectorStore(supabaseAdmin);
  }

  async processDocument(
    metadata: DocumentMetadata,
    options: ProcessingOptions,
    pipelineOptions: PipelineOptions = {}
  ): Promise<number> {
    if (!metadata.extractedText || !metadata.extractedText.trim()) {
      throw new Error('Document metadata is missing extracted text');
    }

    const rawChunks = await this.documentProcessor.processDocument(metadata, options);

    if (!rawChunks.length) {
      return 0;
    }

    const embeddedChunks = await this.embeddingGenerator.generateEmbeddings(
      rawChunks,
      RAG_CONFIG.embeddingModel
    );

    if (!embeddedChunks.length) {
      throw new RetryableError('No embeddings generated');
    }

    await this.vectorStore.storeChunks(embeddedChunks, {
      dryRun: pipelineOptions.dryRun || options.dryRun,
    });

    return embeddedChunks.length;
  }

  async searchSimilarDocuments(query: string): Promise<any[]> {
    try {
      const embeddingResponse = await this.embeddingGenerator.generateEmbeddings(
        [{ content: query, metadata: {} as DocumentMetadata, chunk_index: 0 }],
        RAG_CONFIG.embeddingModel
      );

      if (embeddingResponse.length === 0 || !embeddingResponse[0].embedding) {
        return [];
      }

      return await this.vectorStore.searchSimilarDocuments(
        embeddingResponse[0].embedding,
        query,
        RAG_CONFIG.similarityThreshold,
        RAG_CONFIG.maxResults
      );
    } catch (error) {
      console.error('❌ Error searching similar documents:', error);
      return [];
    }
  }
}
