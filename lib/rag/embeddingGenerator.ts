import { Configuration, OpenAIApi } from 'openai';
import { TextChunk } from './types';

export class EmbeddingGenerator {
  private openai: OpenAIApi;

  constructor(apiKey: string) {
    const config = new Configuration({ apiKey });
    this.openai = new OpenAIApi(config);
  }

  async generateEmbeddings(chunks: TextChunk[], model: string): Promise<string[]> {
    try {
      const embeddings: string[] = [];

      for (const chunk of chunks) {
        const response = await this.openai.createEmbedding({
          model,
          input: chunk.content,
        });

        const embedding = response.data.data[0].embedding;
        embeddings.push(JSON.stringify(embedding)); // JSON string opslaan voor Prisma
      }

      return embeddings;
    } catch (error) {
      console.error('Embedding generation failed:', error);
      throw error;
    }
  }
}