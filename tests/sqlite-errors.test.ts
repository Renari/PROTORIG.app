/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import {
  isRetryableSqliteBusyError,
  normalizeSqliteError,
  withSqliteRetry,
} from '../src/lib/sqlite/sqlite-errors';

describe('sqlite error normalization', () => {
  it('extracts worker error messages and names', () => {
    const normalized = normalizeSqliteError({
      type: 'error',
      result: {
        errorClass: 'SQLite3Error',
        message: 'SQLITE_BUSY: database is locked',
        operation: 'exec',
      },
    });

    expect(normalized.name).toBe('SQLite3Error');
    expect(normalized.message).toBe('SQLITE_BUSY: database is locked');
  });

  it('treats OPFS lock-like errors as retryable', () => {
    expect(isRetryableSqliteBusyError(new Error('Access Handles cannot be created right now'))).toBe(true);
    expect(isRetryableSqliteBusyError(new Error('database disk image is malformed'))).toBe(false);
  });
});

describe('withSqliteRetry', () => {
  it('retries busy errors and eventually succeeds', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('SQLITE_BUSY: database is locked'))
      .mockRejectedValueOnce(new Error('No modification allowed while another tab holds the lock'))
      .mockResolvedValueOnce('ok');
    const onRetry = vi.fn();

    await expect(withSqliteRetry(operation, { baseDelayMs: 0, onRetry })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-lock errors', async () => {
    const operation = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('SQLITE_CORRUPT: malformed'));

    await expect(withSqliteRetry(operation, { baseDelayMs: 0 })).rejects.toThrow('SQLITE_CORRUPT: malformed');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
