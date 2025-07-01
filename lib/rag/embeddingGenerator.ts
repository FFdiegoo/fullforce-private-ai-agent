import OpenAI from 'openai';
import { TextChunk } from './types';

export class EmbeddingGenerator {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async generateEmbeddings(chunks: TextChunk[], model: string): Promise<TextChunk[]> {
    const embeddedChunks: TextChunk[] = [];

    for (const chunk of chunks) {
      try {
        const embeddingResponse = await this.openai.embeddings.create({
          model,
          input: chunk.content,
        });

        const [embedding] = embeddingResponse.data;

        embeddedChunks.push({
          ...chunk,
          embedding: embedding.embedding,
        });
      } catch (error) {
        console.error(`Error generating embedding for chunk ${chunk.chunk_index}:`, error);
        // Continue with other chunks, but don't include this one
      }
    }

    return embeddedChunks;
  }
}