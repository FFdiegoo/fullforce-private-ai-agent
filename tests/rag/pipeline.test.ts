import { RAGPipeline } from '../../lib/rag/pipeline';
import type { SupabaseClient } from '@supabase/supabase-js';

const processDocumentMock = jest.fn();
jest.mock('../../lib/rag/documentProcessor', () => ({
  DocumentProcessor: jest.fn().mockImplementation(() => ({ processDocument: processDocumentMock }))
}));

const generateEmbeddingsMock = jest.fn();
jest.mock('../../lib/rag/embeddingGenerator', () => ({
  EmbeddingGenerator: jest.fn().mockImplementation(() => ({ generateEmbeddings: generateEmbeddingsMock }))
}));

const storeChunksMock = jest.fn();
const searchSimilarDocumentsMock = jest.fn();
jest.mock('../../lib/rag/vectorStore', () => ({
  VectorStore: jest.fn().mockImplementation(() => ({
    storeChunks: storeChunksMock,
    searchSimilarDocuments: searchSimilarDocumentsMock
  }))
}));

jest.mock('../../lib/rag/config', () => ({
  RAG_CONFIG: { embeddingModel: 'test-embed', similarityThreshold: 0.5, maxResults: 3 }
}));

describe('RAGPipeline', () => {
  const eqMock = jest.fn().mockResolvedValue({ error: null });
  const updateMock = jest.fn(() => ({ eq: eqMock }));
  const fromMock = jest.fn(() => ({ update: updateMock }));
  const supabase = { from: fromMock } as unknown as SupabaseClient;

  beforeEach(() => {
    processDocumentMock.mockReset();
    generateEmbeddingsMock.mockReset();
    storeChunksMock.mockReset();
    searchSimilarDocumentsMock.mockReset();
    eqMock.mockClear();
    updateMock.mockClear();
    fromMock.mockClear();
  });

  it('processes document and stores embeddings', async () => {
    processDocumentMock.mockResolvedValue([
      { content: 'chunk', metadata: { id: '1' }, chunk_index: 0 }
    ]);
    generateEmbeddingsMock.mockResolvedValue([
      { content: 'chunk', metadata: { id: '1' }, chunk_index: 0, embedding: [0.1] }
    ]);
    storeChunksMock.mockResolvedValue(undefined);

    const pipeline = new RAGPipeline(supabase, 'key');
    await pipeline.processDocument({ id: 'doc1', filename: 'f' } as any, {} as any);

    expect(processDocumentMock).toHaveBeenCalled();
    expect(generateEmbeddingsMock).toHaveBeenCalled();
    expect(storeChunksMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ processed: true }));
  });

  it('updates status to false on failure', async () => {
    processDocumentMock.mockRejectedValue(new Error('fail'));

    const pipeline = new RAGPipeline(supabase, 'key');
    await expect(
      pipeline.processDocument({ id: 'doc1', filename: 'f' } as any, {} as any)
    ).rejects.toThrow('fail');

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ processed: false }));
  });

  it('searches similar documents', async () => {
    generateEmbeddingsMock.mockResolvedValue([{ embedding: [0.1, 0.2] }]);
    searchSimilarDocumentsMock.mockResolvedValue([{ content: 'doc', similarity: 0.9 }]);

    const pipeline = new RAGPipeline(supabase, 'key');
    const results = await pipeline.searchSimilarDocuments('query');

    expect(generateEmbeddingsMock).toHaveBeenCalled();
    expect(searchSimilarDocumentsMock).toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });
});
