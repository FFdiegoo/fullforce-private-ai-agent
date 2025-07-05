import OpenAI from 'openai';
import { TextChunk } from './types';

export class EmbeddingGenerator {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async generateEmbeddings(chunks: TextChunk[], model: string): Promise<TextChunk[]> {
    console.log(`🧠 Generating embeddings for ${chunks.length} chunks using ${model}...`);
    
    const embeddedChunks: TextChunk[] = [];
    const batchSize = 20; // Process in batches to avoid rate limits

    // Process chunks in batches
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
      console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)} (${batch.length} chunks)`);
      
      try {
        // Extract content from each chunk in the batch
        const contents = batch.map(chunk => chunk.content);
        
        // Generate embeddings for the entire batch
        const embeddingResponse = await this.openai.embeddings.create({
          model,
          input: contents,
        });

        // Add embeddings to chunks
        for (let j = 0; j < batch.length; j++) {
          embeddedChunks.push({
            ...batch[j],
            embedding: embeddingResponse.data[j].embedding,
          });
        }

        // Small delay to avoid rate limiting
        if (i + batchSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`❌ Error generating embeddings for batch starting at chunk ${i}:`, error);
        
        // Add chunks without embeddings so we don't lose the content
        batch.forEach(chunk => {
          console.warn(`⚠️ Adding chunk ${chunk.chunk_index} without embedding due to error`);
          embeddedChunks.push(chunk);
        });
      }
    }

    console.log(`✅ Generated embeddings for ${embeddedChunks.filter(c => c.embedding).length}/${chunks.length} chunks`);
    return embeddedChunks;
  }
}