const BUSY_ERROR_PATTERNS = [
  /\bSQLITE_BUSY\b/i,
  /\bSQLITE_LOCKED\b/i,
  /\bSQLITE_IOERR_(?:LOCK|BLOCKED|ACCESS|SHMLOCK|SHMOPEN|SHMMAP)\b/i,
  /database is locked/i,
  /access handles cannot be created/i,
  /no modification allowed/i,
  /SyncAccessHandle/i,
];

type WorkerErrorShape = {
  result?: {
    errorClass?: string;
    message?: string;
    operation?: string;
  };
  message?: string;
  name?: string;
};

export function normalizeSqliteError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  const workerError = error as WorkerErrorShape | undefined;
  const message =
    workerError?.result?.message ||
    workerError?.message ||
    'Unknown SQLite worker error.';
  const normalized = new Error(message, { cause: error });
  normalized.name = workerError?.result?.errorClass || workerError?.name || 'Error';
  return normalized;
}

export function isRetryableSqliteBusyError(error: unknown): boolean {
  const normalized = normalizeSqliteError(error);
  return BUSY_ERROR_PATTERNS.some((pattern) => pattern.test(normalized.message));
}

export async function withSqliteRetry<T>(
  operation: () => Promise<T>,
  options: {
    attempts?: number;
    baseDelayMs?: number;
    onRetry?: (error: Error, attempt: number) => Promise<void> | void;
  } = {}
): Promise<T> {
  const attempts = options.attempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 50;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const normalized = normalizeSqliteError(error);
      const canRetry = attempt < attempts && isRetryableSqliteBusyError(normalized);
      if (!canRetry) {
        throw normalized;
      }

      await options.onRetry?.(normalized, attempt);
      await new Promise((resolve) => {
        globalThis.setTimeout(resolve, baseDelayMs * attempt);
      });
    }
  }

  throw new Error('SQLite retry loop exited unexpectedly.');
}
