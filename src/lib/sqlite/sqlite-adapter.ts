import type { BindingSpec, Worker1Promiser } from '@sqlite.org/sqlite-wasm';
import { getSqlitePromiser, terminateSqliteWorker } from './sqlite-promiser';
import { withSqliteRetry } from './sqlite-errors';

const DATABASE_FILENAME = 'file:/protorig.db?vfs=opfs&mode=rwc';
const CONNECTION_PRAGMAS = `
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 1000;
`;

type SqliteBindValue = string | number | bigint | boolean | null | Uint8Array | Int8Array | ArrayBuffer;
type SqliteNamedBindings = Record<string, SqliteBindValue | undefined>;

export interface SqliteConnectionInfo {
  dbId: string;
  filename: string;
  vfs: string;
}

export interface SqliteBatchStatement {
  sql: string;
  bind?: SqliteNamedBindings;
}

interface JournalModeRow {
  journal_mode: string;
}

let connectionInfo: SqliteConnectionInfo | null = null;

function getPromiserExecResultRows<T>(result: unknown): T[] {
  const rows = (result as { resultRows?: T[] } | undefined)?.resultRows;
  return Array.isArray(rows) ? rows : [];
}

async function execResultRows<T>(promiser: Worker1Promiser, sql: string): Promise<T[]> {
  const response = await promiser('exec', {
    sql,
    rowMode: 'object',
    returnValue: 'resultRows',
    resultRows: [],
  });

  return getPromiserExecResultRows<T>(response.result);
}

function normalizeNamedBindingValue(value: SqliteBindValue | undefined): SqliteBindValue | null {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return value ?? null;
}

function normalizeBindingKey(key: string): string {
  return /^[?@:$.]/u.test(key) ? key : `:${key}`;
}

function isBinaryBindingValue(value: unknown): value is Uint8Array | Int8Array | ArrayBuffer {
  return value instanceof Uint8Array || value instanceof Int8Array || value instanceof ArrayBuffer;
}

function normalizeBindingSpec(bind?: BindingSpec): BindingSpec | undefined {
  if (bind === undefined) {
    return undefined;
  }

  if (Array.isArray(bind)) {
    return bind.map((value) => normalizeNamedBindingValue(value));
  }

  if (
    bind === null ||
    typeof bind === 'string' ||
    typeof bind === 'number' ||
    typeof bind === 'bigint' ||
    typeof bind === 'boolean' ||
    isBinaryBindingValue(bind)
  ) {
    return normalizeNamedBindingValue(bind);
  }

  const normalizedEntries = Object.entries(bind).map(([key, value]) => [
    normalizeBindingKey(key),
    normalizeNamedBindingValue(value),
  ]);

  return Object.fromEntries(normalizedEntries);
}

async function rollbackTransaction(promiser: Worker1Promiser): Promise<void> {
  try {
    await promiser('exec', { sql: 'ROLLBACK;' });
  } catch {
    // Connection close will drop any orphaned transaction state.
  }
}

async function normalizeLegacyWalMode(promiser: Worker1Promiser): Promise<void> {
  await promiser('exec', { sql: 'PRAGMA locking_mode=exclusive;' });

  try {
    const [journalMode] = await execResultRows<JournalModeRow>(promiser, 'PRAGMA journal_mode;');
    if (journalMode?.journal_mode?.toLowerCase() === 'wal') {
      await promiser('exec', {
        sql: `
          PRAGMA wal_checkpoint(TRUNCATE);
          PRAGMA journal_mode=DELETE;
        `,
      });
    }
  } finally {
    await promiser('exec', { sql: 'PRAGMA locking_mode=normal;' });
  }
}

export function getOpenSqliteConnection(): SqliteConnectionInfo | null {
  return connectionInfo;
}

export async function openSqliteConnection(): Promise<SqliteConnectionInfo> {
  if (connectionInfo) {
    return connectionInfo;
  }

  return withSqliteRetry(async () => {
    const promiser = await getSqlitePromiser();
    const config = await promiser('config-get', {});
    if (!config.result.vfsList.includes('opfs')) {
      throw new Error(
        'The SQLite OPFS VFS is unavailable in this browser session. ' +
        'This app requires a cross-origin-isolated page with ' +
        'Cross-Origin-Opener-Policy: same-origin and ' +
        'Cross-Origin-Embedder-Policy set to either require-corp or credentialless.'
      );
    }

    const response = await promiser('open', { filename: DATABASE_FILENAME });
    connectionInfo = {
      dbId: (response as { dbId?: string }).dbId ?? response.result.dbId,
      filename: response.result.filename,
      vfs: response.result.vfs,
    };
    try {
      await normalizeLegacyWalMode(promiser);
      await promiser('exec', { sql: CONNECTION_PRAGMAS });
    } catch (error) {
      connectionInfo = null;
      try {
        await promiser('close', {});
      } catch {
        terminateSqliteWorker();
      }
      throw error;
    }

    return connectionInfo;
  }, {
    onRetry: async () => {
      await closeSqliteConnection();
    },
  });
}

export async function closeSqliteConnection(): Promise<void> {
  if (!connectionInfo) {
    return;
  }

  connectionInfo = null;

  try {
    const promiser = await getSqlitePromiser();
    await promiser('close', {});
  } catch {
    terminateSqliteWorker();
  }
}

export async function cleanupSqliteWorkerIfIdle(): Promise<boolean> {
  if (connectionInfo) {
    return false;
  }

  terminateSqliteWorker();
  return true;
}

export async function execSql(sql: string, bind?: BindingSpec): Promise<void> {
  await withSqliteRetry(async () => {
    const promiser = await getSqlitePromiser();
    await openSqliteConnection();
    await promiser('exec', { sql, bind: normalizeBindingSpec(bind) });
  }, {
    onRetry: async () => {
      await closeSqliteConnection();
    },
  });
}

export async function getSql<T>(
  sql: string,
  bind?: BindingSpec
): Promise<T | undefined> {
  return withSqliteRetry(async () => {
    const promiser = await getSqlitePromiser();
    await openSqliteConnection();
    const response = await promiser('exec', {
      sql,
      bind: normalizeBindingSpec(bind),
      rowMode: 'object',
      returnValue: 'resultRows',
      resultRows: [],
    });
    return getPromiserExecResultRows<T>(response.result)[0];
  }, {
    onRetry: async () => {
      await closeSqliteConnection();
    },
  });
}

export async function allSql<T>(
  sql: string,
  bind?: BindingSpec
): Promise<T[]> {
  return withSqliteRetry(async () => {
    const promiser = await getSqlitePromiser();
    await openSqliteConnection();
    const response = await promiser('exec', {
      sql,
      bind: normalizeBindingSpec(bind),
      rowMode: 'object',
      returnValue: 'resultRows',
      resultRows: [],
    });
    return getPromiserExecResultRows<T>(response.result);
  }, {
    onRetry: async () => {
      await closeSqliteConnection();
    },
  });
}

export async function runTransactionBatch(statements: SqliteBatchStatement[]): Promise<void> {
  if (statements.length === 0) {
    return;
  }

  await withSqliteRetry(async () => {
    const promiser = await getSqlitePromiser();
    await openSqliteConnection();

    try {
      await promiser('exec', { sql: 'BEGIN IMMEDIATE;' });
      for (const statement of statements) {
        await promiser('exec', {
          sql: statement.sql,
          bind: normalizeBindingSpec(statement.bind),
        });
      }
      await promiser('exec', { sql: 'COMMIT;' });
    } catch (error) {
      await rollbackTransaction(promiser);
      throw error;
    }
  }, {
    onRetry: async () => {
      await closeSqliteConnection();
    },
  });
}
