export class RetryableError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RetryableError';
    this.cause = cause;
  }
}

export class ContentError extends Error {
  public readonly code: string;
  public readonly detail?: string;

  constructor(code: string, message?: string, detail?: string) {
    super(message ?? code);
    this.name = 'ContentError';
    this.code = code;
    this.detail = detail;
  }
}

export class NeedsOcrError extends ContentError {
  constructor(message?: string, detail?: string) {
    super('needs-ocr', message ?? 'needs-ocr', detail);
    this.name = 'NeedsOcrError';
  }
}

export const isRetryableError = (error: unknown): boolean => {
  if (!error) return false;
  if (error instanceof RetryableError) return true;
  if (typeof error === 'object' && 'isRetryable' in (error as any)) {
    return Boolean((error as any).isRetryable);
  }
  return false;
};

export const isContentError = (error: unknown): error is ContentError => error instanceof ContentError;

export const isNeedsOcrError = (error: unknown): error is NeedsOcrError => error instanceof NeedsOcrError;
