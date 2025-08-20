import handler from '../../pages/api/chat.ts';
import { createMocks } from 'node-mocks-http';

var insertMock: jest.Mock;
var fromMock: jest.Mock;
jest.mock('../../lib/supabaseClient', () => {
  insertMock = jest.fn().mockResolvedValue({});
  fromMock = jest.fn(() => ({ insert: insertMock }));
  return { supabase: { from: fromMock } };
});

var searchSimilarDocuments: jest.Mock;
jest.mock('../../lib/rag/pipeline', () => {
  searchSimilarDocuments = jest.fn();
  return {
    RAGPipeline: jest.fn().mockImplementation(() => ({
      searchSimilarDocuments,
    })),
  };
});

var createCompletion: jest.Mock;
jest.mock('openai', () => {
  createCompletion = jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'Test response' } }],
  });
  return {
    OpenAI: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: createCompletion } },
    })),
  };
});

jest.mock('../../lib/rag/config', () => ({ openaiApiKey: 'test-key' }));

describe('chat API', () => {
  beforeEach(() => {
    insertMock.mockClear();
    fromMock.mockClear();
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
    searchSimilarDocuments.mockResolvedValue([{ content: 'Doc', metadata: {}, similarity: 0.9 }]);
    const { req, res } = createMocks({ method: 'POST', body: { prompt: 'Hi' } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.reply).toBe('Test response');
    expect(data.modelUsed).toBeDefined();
    expect(Array.isArray(data.sources)).toBe(true);
  });

  it('handles pipeline errors gracefully', async () => {
    searchSimilarDocuments.mockRejectedValue(new Error('boom'));
    const { req, res } = createMocks({ method: 'POST', body: { prompt: 'Hi' } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
  });
});
