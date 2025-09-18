export class RetryableError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RetryableError';
    this.cause = cause;
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
