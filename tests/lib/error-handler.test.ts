import { ErrorHandler } from '../../lib/error-handler';
import { createMocks } from 'node-mocks-http';

jest.mock('../../lib/enhanced-audit-logger', () => ({
  auditLogger: { logError: jest.fn(), logCritical: jest.fn() }
}));
import { auditLogger } from '../../lib/enhanced-audit-logger';
const logError = (auditLogger as any).logError as jest.Mock;
const logCritical = (auditLogger as any).logCritical as jest.Mock;

describe('ErrorHandler', () => {
  beforeEach(() => {
    logError.mockClear();
    logCritical.mockClear();
  });

  it('categorizes validation errors', () => {
    const result = ErrorHandler.categorizeError(new Error('validation failed'), 'id1');
    expect(result.status).toBe(400);
    expect(result.body.type).toBe('VALIDATION_ERROR');
  });

  it('defaults to internal error', () => {
    const result = ErrorHandler.categorizeError(new Error('unknown'), 'id2');
    expect(result.status).toBe(500);
    expect(result.body.type).toBe('INTERNAL_ERROR');
  });

  it('handles API errors and logs', async () => {
    const { req, res } = createMocks({ method: 'GET', url: '/api/test' });
    await ErrorHandler.handleApiError(new Error('validation failed'), req as any, res as any, { action: 'TEST' });
    expect(logError).toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.type).toBe('VALIDATION_ERROR');
    expect(body.errorId).toBeDefined();
  });
});
