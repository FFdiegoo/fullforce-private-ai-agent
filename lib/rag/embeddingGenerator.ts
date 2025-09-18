import OpenAI from 'openai';
import { RAG_CONFIG, EMBEDDING_DIMENSIONS } from './config';
import { RetryableError } from './errors';
import { TextChunk } from './types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type BatchOptions = {
  batchSize?: number;
  concurrency?: number;
  delayMs?: number;
  retryMax?: number;
};

export class EmbeddingGenerator {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async generateEmbeddings(
    chunks: TextChunk[],
    model: string,
    options: BatchOptions = {}
  ): Promise<TextChunk[]> {
    if (!chunks.length) {
      return [];
    }

    const batchSize = options.batchSize ?? RAG_CONFIG.batchSize;
    const concurrency = options.concurrency ?? RAG_CONFIG.concurrency;
    const delayMs = options.delayMs ?? RAG_CONFIG.delayMs;
    const retryMax = options.retryMax ?? RAG_CONFIG.retryMax;

    const batches: TextChunk[][] = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      batches.push(chunks.slice(i, Math.min(i + batchSize, chunks.length)));
    }

    const embeddedChunks: TextChunk[] = [];
    let nextBatchIndex = 0;

    const worker = async () => {
      while (nextBatchIndex < batches.length) {
        const currentIndex = nextBatchIndex++;
        const batch = batches[currentIndex];

        const embedded = await this.processBatch({
          batch,
          model,
          batchIndex: currentIndex,
          totalBatches: batches.length,
          retryMax,
        });

        embeddedChunks.push(...embedded);

        if (delayMs > 0 && nextBatchIndex < batches.length) {
          await sleep(delayMs);
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, batches.length) }, () => worker());
    await Promise.all(workers);

    return embeddedChunks;
  }

  private async processBatch({
    batch,
    model,
    batchIndex,
    totalBatches,
    retryMax,
  }: {
    batch: TextChunk[];
    model: string;
    batchIndex: number;
    totalBatches: number;
    retryMax: number;
  }): Promise<TextChunk[]> {
    let attempt = 0;

    while (attempt <= retryMax) {
      try {
        console.log(
          `📦 Generating embeddings batch ${batchIndex + 1}/${totalBatches} (size=${batch.length}) attempt=${attempt + 1}`
        );

        const contents = batch.map((chunk) => chunk.content);
        const response = await this.openai.embeddings.create({
          model,
          input: contents,
        });

        if (!response.data || response.data.length !== batch.length) {
          throw new Error('Embedding response missing data');
        }

        return batch.map((chunk, idx) => {
          const embedding = response.data[idx]?.embedding;
          if (!embedding) {
            throw new Error(`Embedding missing for chunk index ${idx}`);
          }
          if (embedding.length !== EMBEDDING_DIMENSIONS) {
            throw new Error(
              `Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, received ${embedding.length}`
            );
          }
          return {
            ...chunk,
            embedding,
          };
        });
      } catch (error: any) {
        const status = error?.status ?? error?.statusCode ?? error?.response?.status;
        const isRetryable = status === 429 || (typeof status === 'number' && status >= 500);

        if (!isRetryable || attempt >= retryMax) {
          if (isRetryable && attempt >= retryMax) {
            throw new RetryableError('Embedding retries exhausted', error);
          }
          throw error;
        }

        const delay = Math.min(60_000, Math.pow(2, attempt) * 1000);
        console.warn(
          `⚠️ Embedding batch ${batchIndex + 1} retry ${attempt + 1}/${retryMax} after ${delay}ms due to ${
            status || error?.code || 'unknown'
          }`
        );
        attempt += 1;
        await sleep(delay);
      }
    }

    throw new RetryableError('Embedding retries exhausted');
  }
}