import type { TextChunk } from '../../lib/rag/types';

jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(),
      eq: jest.fn(),
      order: jest.fn(),
      limit: jest.fn(),
    })),
    storage: { from: jest.fn(() => ({ download: jest.fn() })) },
  })),
}));

jest.mock('../../lib/rag/pipeline', () => ({
  RAGPipeline: jest.fn().mockImplementation(() => ({ processDocument: jest.fn() })),
}));

const sharpToBufferMock = jest.fn();
const sharpMetadataMock = jest.fn().mockResolvedValue({ pages: 1 });

jest.mock('sharp', () => {
  const chain = {
    ensureAlpha: jest.fn().mockReturnThis(),
    grayscale: jest.fn().mockReturnThis(),
    toFormat: jest.fn().mockReturnThis(),
    toBuffer: sharpToBufferMock,
    metadata: sharpMetadataMock,
  };
  const sharpFn = jest.fn(() => chain);
  sharpFn.default = sharpFn;
  return sharpFn;
});

const recognizeMock = jest.fn();
const terminateMock = jest.fn();

jest.mock('tesseract.js', () => ({
  createWorker: jest.fn(async () => ({ recognize: recognizeMock, terminate: terminateMock })),
}));

describe('ingest behaviour', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sharpToBufferMock.mockResolvedValue(Buffer.from('image'));
    recognizeMock.mockResolvedValue({ data: { text: '  OCR tekst  ' } });
    terminateMock.mockResolvedValue(undefined);
    sharpMetadataMock.mockResolvedValue({ pages: 1 });
  });

  it('uses OCR pipeline for images', async () => {
    const { fileTypeFromBuffer } = await import('file-type');
    (fileTypeFromBuffer as jest.Mock).mockResolvedValue({ mime: 'image/png' });

    const { extractText } = await import('../../lib/rag/extract-text');
    const result = await extractText(Buffer.from('dummy'), 'foto.png');

    expect(result.usedOcr).toBe(true);
    expect(result.ocrAttempted).toBe(true);
    expect(result.text).toBe('OCR tekst');

    const { createWorker } = await import('tesseract.js');
    expect((createWorker as jest.Mock)).toHaveBeenCalledWith('nld+eng');
    expect(recognizeMock).toHaveBeenCalled();
    expect(terminateMock).toHaveBeenCalled();
  });

  it('skips unsupported and system files', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    process.env.SUPABASE_DOCUMENTS_BUCKET = 'bucket';
    process.env.OPENAI_API_KEY = 'test-key';

    const module = await import('../../scripts/process-all-pending-documents.js');
    const { shouldSkipDocument } = module;

    expect(shouldSkipDocument({ filename: 'Thumbs.db' } as any)).toEqual(
      expect.objectContaining({ skip: true, lastError: 'ignored-system-file' })
    );
    expect(shouldSkipDocument({ filename: 'document.zip' } as any)).toEqual(
      expect.objectContaining({ skip: true, lastError: 'unsupported-archive' })
    );
    expect(shouldSkipDocument({ filename: 'report.nlbl' } as any)).toEqual(
      expect.objectContaining({ skip: true, lastError: 'unsupported-archive' })
    );
  });

  it('upserts document chunks idempotently', async () => {
    const upsertMock = jest.fn().mockResolvedValue({ error: null });
    const gtMock = jest.fn().mockResolvedValue({ error: null });
    const eqMock = jest.fn(() => ({ gt: gtMock }));
    const deleteMock = jest.fn(() => ({ eq: eqMock }));
    const fromMock = jest.fn(() => ({ upsert: upsertMock, delete: deleteMock }));

    const supabase = { from: fromMock } as any;

    const { VectorStore } = await import('../../lib/rag/vectorStore');
    const store = new VectorStore(supabase as any);
    const chunks: TextChunk[] = [
      { docId: 'doc', chunk_index: 0, content: 'A', embedding: Array(1536).fill(0), metadata: {} },
      { docId: 'doc', chunk_index: 1, content: 'B', embedding: Array(1536).fill(1), metadata: {} },
    ];

    await store.storeChunks(chunks);
    await store.storeChunks(chunks);

    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ doc_id: 'doc', chunk_index: 0 }),
        expect.objectContaining({ doc_id: 'doc', chunk_index: 1 }),
      ]),
      expect.objectContaining({ onConflict: 'doc_id,chunk_index' })
    );
    expect(deleteMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith('doc_id', 'doc');
    expect(gtMock).toHaveBeenCalledWith('chunk_index', 1);
  });
});
