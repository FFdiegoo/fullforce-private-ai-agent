import { DocumentMetadata, TextChunk, ProcessingOptions } from './types';

const MIN_CHUNK_SIZE = 200;

export class DocumentProcessor {
  async processDocument(
    metadata: DocumentMetadata,
    options: ProcessingOptions
  ): Promise<TextChunk[]> {
    try {
      const baseText = metadata.extractedText ?? '';
      const text = this.normaliseText(baseText);

      if (!text) {
        return [];
      }

      const chunkSize = Math.max(options.chunkSize || MIN_CHUNK_SIZE, MIN_CHUNK_SIZE);
      const overlap = Math.max(0, Math.min(options.chunkOverlap || 0, chunkSize - 1));

      const chunks = this.createChunks(text, chunkSize, overlap);

      return chunks.map((content, index) => ({
        content,
        metadata: {
          id: metadata.id,
          filename: metadata.filename,
          storage_path: metadata.storage_path,
          bucket: metadata.bucket,
          afdeling: metadata.afdeling,
          categorie: metadata.categorie,
          onderwerp: metadata.onderwerp,
          versie: metadata.versie,
        },
        chunk_index: index,
        docId: metadata.id,
      }));
    } catch (error) {
      console.error(`❌ Error processing document ${metadata.filename}:`, error);
      throw error;
    }
  }

  private normaliseText(text: string): string {
    if (!text) return '';
    return text
      .replace(/\u0000/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/[\t\f\v]+/g, ' ')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private createChunks(text: string, chunkSize: number, overlap: number): string[] {
    if (!text) return [];

    const cleanText = text.trim();
    if (!cleanText) return [];

    if (cleanText.length <= chunkSize) {
      return [cleanText];
    }

    const chunks: string[] = [];
    const step = Math.max(1, chunkSize - overlap);
    let start = 0;

    while (start < cleanText.length) {
      const end = Math.min(start + chunkSize, cleanText.length);
      const piece = cleanText.slice(start, end).trim();
      if (piece) {
        chunks.push(piece);
      }
      if (end === cleanText.length) {
        break;
      }
      start += step;
    }

    return chunks;
  }
}