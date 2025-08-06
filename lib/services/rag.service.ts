// RAG (Retrieval-Augmented Generation) service
import { BaseService } from './base.service';
import { OpenAI } from 'openai';
import { supabase } from '../database/client';
import { chatMessageSchema, type ChatMessageRequest } from '../validators/chat';
import { AI_CONFIG } from '../constants';
import type { ChatResponse, DocumentSource, Result } from '../types';

interface SearchResult {
  id: string;
  content: string;
  metadata: any;
  similarity: number;
}

export class RAGService extends BaseService {
  private openai: OpenAI;

  constructor() {
    super('RAGService');
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateResponse(request: ChatMessageRequest, userId: string): Promise<Result<ChatResponse>> {
    return this.executeWithLogging(
      'RAG_GENERATE_RESPONSE',
      async () => {
        const validation = this.validateInput(chatMessageSchema, request);
        if (!validation.success) {
          throw validation.error;
        }

        const { prompt, mode, model } = validation.data;

        // Step 1: Generate embedding for the query
        const queryEmbedding = await this.generateEmbedding(prompt);

        // Step 2: Search for relevant document chunks
        const searchResults = await this.searchDocuments(queryEmbedding);

        // Step 3: Generate response with or without context
        const response = await this.generateAIResponse(prompt, mode, model, searchResults);

        return response;
      },
      userId,
      { prompt: request.prompt.substring(0, 100), mode: request.mode, model: request.model }
    );
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: AI_CONFIG.embedding.model,
        input: text.substring(0, 8000), // Limit for embedding API
        encoding_format: 'float'
      });

      return response.data[0].embedding;
    } catch (error) {
      this.logger.error('Failed to generate embedding', { error });
      throw new Error('Failed to generate embedding for query');
    }
  }

  private async searchDocuments(queryEmbedding: number[]): Promise<SearchResult[]> {
    try {
      const { data, error } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: AI_CONFIG.rag.similarityThreshold,
        match_count: AI_CONFIG.rag.maxChunks
      });

      if (error) {
        throw new Error(`Vector search failed: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      this.logger.error('Document search failed', { error });
      throw new Error('Failed to search documents');
    }
  }

  private async generateAIResponse(
    prompt: string,
    mode: 'technical' | 'procurement',
    model: 'simple' | 'complex',
    searchResults: SearchResult[]
  ): Promise<ChatResponse> {
    const modelName = AI_CONFIG.models[model];
    const hasContext = searchResults.length > 0;

    let systemPrompt: string;
    let sources: DocumentSource[] = [];

    if (hasContext) {
      // Build context from search results
      const context = searchResults
        .map((result, index) => {
          const metadata = result.metadata || {};
          const filename = metadata.filename || 'Unknown document';
          return `[Document ${index + 1}: ${filename}]\n${result.content}`;
        })
        .join('\n\n');

      // Limit context size
      const maxContextLength = AI_CONFIG.rag.maxContextTokens * 4; // Rough character estimate
      const truncatedContext = context.length > maxContextLength 
        ? context.substring(0, maxContextLength) + '\n\n[Context truncated...]'
        : context;

      systemPrompt = this.buildContextualSystemPrompt(mode, truncatedContext);

      // Prepare sources
      sources = searchResults.map((result, index) => {
        const metadata = result.metadata || {};
        return {
          documentId: metadata.id || 'unknown',
          filename: metadata.filename || 'Unknown document',
          chunkIndex: metadata.chunk_index || index,
          similarityScore: Math.round(result.similarity * 100) / 100,
          contentPreview: result.content.substring(0, 200) + '...',
          afdeling: metadata.afdeling,
          categorie: metadata.categorie
        };
      });
    } else {
      systemPrompt = this.buildGeneralSystemPrompt(mode);
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: hasContext ? 1000 : 800,
        temperature: hasContext ? 0.3 : 0.7, // Lower temperature for factual responses
      });

      const reply = completion.choices[0]?.message?.content || 
        'Sorry, er is een fout opgetreden bij het genereren van het antwoord.';

      return {
        reply,
        modelUsed: modelName,
        contextUsed: hasContext,
        sources,
        documentsSearched: searchResults.length,
        processingInfo: {
          embeddingGenerated: true,
          vectorSearchPerformed: true,
          contextLength: hasContext ? context.length : 0,
          relevanceThreshold: AI_CONFIG.rag.similarityThreshold
        }
      };
    } catch (error) {
      this.logger.error('AI response generation failed', { error, model: modelName });
      throw new Error('Failed to generate AI response');
    }
  }

  private buildContextualSystemPrompt(mode: 'technical' | 'procurement', context: string): string {
    const basePrompt = mode === 'technical'
      ? `Je bent CeeS, de interne kennisbank-chatbot voor CSrental, gespecialiseerd in technische ondersteuning.
         Gebruik de onderstaande documentcontext om nauwkeurige, technische antwoorden te geven.
         Verwijs naar specifieke documenten waar relevant. Als de context niet voldoende is, zeg dat duidelijk.`
      : `Je bent ChriS, de digitale inkoopassistent van CSrental.
         Gebruik de onderstaande documentcontext om nauwkeurige inkoop- en leveranciersinformatie te geven.
         Verwijs naar specifieke documenten waar relevant. Als de context niet voldoende is, zeg dat duidelijk.`;

    return `${basePrompt}\n\nBeschikbare documentcontext:\n${context}`;
  }

  private buildGeneralSystemPrompt(mode: 'technical' | 'procurement'): string {
    return mode === 'technical'
      ? `Je bent CeeS, de interne kennisbank-chatbot voor CSrental, gespecialiseerd in technische ondersteuning. 
         Er zijn geen relevante documenten gevonden voor deze vraag. Geef een algemeen technisch advies en 
         suggereer dat de gebruiker relevante documenten kan uploaden voor betere ondersteuning.`
      : `Je bent ChriS, de digitale inkoopassistent van CSrental. Er zijn geen relevante documenten gevonden 
         voor deze vraag. Geef algemeen inkoop-advies en suggereer dat de gebruiker relevante documenten 
         kan uploaden voor betere ondersteuning.`;
  }

  async testVectorSearch(query: string, limit: number = 5): Promise<Result<SearchResult[]>> {
    return this.executeWithLogging(
      'TEST_VECTOR_SEARCH',
      async () => {
        const queryEmbedding = await this.generateEmbedding(query);
        const results = await this.searchDocuments(queryEmbedding);
        return results.slice(0, limit);
      },
      undefined,
      { query: query.substring(0, 100), limit }
    );
  }
}

// Export singleton instance
export const ragService = new RAGService();