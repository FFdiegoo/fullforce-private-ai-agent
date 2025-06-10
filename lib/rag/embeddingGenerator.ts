import OpenAI from 'openai';
import { TextChunk } from './types';

export class EmbeddingGenerator {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async generateEmbeddings(chunks: TextChunk[], model: string): Promise<string[]> {
    const embeddings: string[] = [];

    for (const chunk of chunks) {
      try {
        const response = await this.openai.embeddings.create({
          model,
          input: chunk.content,
        });

        const embedding = response.data[0].embedding;
        embeddings.push(JSON.stringify(embedding)); // serialize for storage
      } catch (error) {
        console.error('Error generating embedding:', error);
        throw error;
      }
    }

    return embeddings;
  }
}
