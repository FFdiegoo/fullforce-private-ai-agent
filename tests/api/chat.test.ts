import { createMocks } from 'node-mocks-http';

type SupabaseMockModule = {
  supabaseAdmin: { from: jest.Mock };
  __mocks: {
    fromMock: jest.Mock;
    selectSessionMock: jest.Mock;
    maybeSingleMock: jest.Mock;
    insertSessionMock: jest.Mock;
    insertMessageMock: jest.Mock;
    singleMock: jest.Mock;
  };
};

type PipelineMockModule = {
  RAGPipeline: jest.Mock;
  __mocks: {
    searchSimilarDocuments: jest.Mock;
  };
};

type OpenAIMockModule = {
  OpenAI: jest.Mock;
  __mocks: {
    createCompletion: jest.Mock;
  };
};

jest.mock('../../lib/server/supabaseAdmin', () => {
  const maybeSingleMock = jest.fn().mockResolvedValue({ data: null, error: null });
  const selectSessionMock = jest.fn(() => ({
    eq: jest.fn(() => ({ maybeSingle: maybeSingleMock })),
  }));

  const singleMock = jest.fn().mockResolvedValue({
    data: { id: 'session-id' },
    error: null,
  });

  const insertSessionMock = jest.fn(() => ({
    select: jest.fn(() => ({ single: singleMock })),
  }));

  const insertMessageMock = jest.fn().mockResolvedValue({ data: null, error: null });

  const fromMock = jest.fn((table: string) => {
    if (table === 'chat_sessions') {
      return {
        select: selectSessionMock,
        insert: insertSessionMock,
      };
    }

    if (table === 'chat_messages') {
      return {
        insert: insertMessageMock,
      };
    }

    return {};
  });

  return {
    supabaseAdmin: { from: fromMock },
    __mocks: {
      fromMock,
      selectSessionMock,
      maybeSingleMock,
      insertSessionMock,
      insertMessageMock,
      singleMock,
    },
  } satisfies SupabaseMockModule;
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({ select: jest.fn(), eq: jest.fn() })),
  })),
}));

jest.mock('../../lib/rag/pipeline', () => {
  const searchSimilarDocuments = jest.fn();
  return {
    RAGPipeline: jest.fn().mockImplementation(() => ({
      searchSimilarDocuments,
    })),
    __mocks: { searchSimilarDocuments },
  } satisfies PipelineMockModule;
});

jest.mock('openai', () => {
  const createCompletion = jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'Test response' } }],
  });
  return {
    OpenAI: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: createCompletion } },
    })),
    __mocks: { createCompletion },
  } satisfies OpenAIMockModule;
});

jest.mock('../../lib/rag/config', () => ({
  openaiApiKey: 'test-key',
  RAG_CONFIG: { maxResults: 3 },
}));

const {
  __mocks: {
    fromMock,
    selectSessionMock,
    maybeSingleMock,
    insertSessionMock,
    insertMessageMock,
    singleMock,
  },
} = jest.requireMock('../../lib/server/supabaseAdmin') as SupabaseMockModule;

const {
  __mocks: { searchSimilarDocuments },
} = jest.requireMock('../../lib/rag/pipeline') as PipelineMockModule;

const {
  __mocks: { createCompletion },
} = jest.requireMock('openai') as OpenAIMockModule;

const handler = require('../../pages/api/chat.ts').default;

describe('chat API', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    process.env.OPENAI_API_KEY = 'test';
  });

  beforeEach(() => {
    fromMock.mockClear();
    selectSessionMock.mockClear();
    maybeSingleMock.mockClear();
    insertSessionMock.mockClear();
    insertMessageMock.mockClear();
    singleMock.mockClear();
    searchSimilarDocuments.mockReset();
    createCompletion.mockClear();
  });

  it('returns 405 for non-POST method', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it('validates prompt input', async () => {
    const { req, res } = createMocks({ method: 'POST', body: {} });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it('returns reply and sources on success', async () => {
    searchSimilarDocuments.mockResolvedValue([
      { content: 'Doc', metadata: {}, similarity: 0.9 },
    ]);
    const { req, res } = createMocks({ method: 'POST', body: { message: 'Hi' } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.answer).toBe('Test response');
    expect(Array.isArray(data.sources)).toBe(true);
  });

  it('handles pipeline errors gracefully', async () => {
    searchSimilarDocuments.mockRejectedValue(new Error('boom'));
    const { req, res } = createMocks({ method: 'POST', body: { message: 'Hi' } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
  });
});
