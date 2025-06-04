import { TextChunk } from './types';
import { OpenAI } from 'openai';

export class EmbeddingGenerator {
  private openai: OpenAI;
  
  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async generateEmbeddings(chunks: TextChunk[]): Promise<TextChunk[]> {
    const embeddedChunks: TextChunk[] = [];

    for (const chunk of chunks) {
      try {
        const response = await this.openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: chunk.content,
        });

        embeddedChunks.push({
          ...chunk,
          embedding: response.data[0].embedding,
        });
      } catch (error) {
        console.error(`Error generating embedding for chunk ${chunk.chunk_index}:`, error);
        throw error;
      }
    }

    return embeddedChunks;
  }
}