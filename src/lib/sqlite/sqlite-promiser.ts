import { sqlite3Worker1Promiser, type Worker1Promiser } from '@sqlite.org/sqlite-wasm';

let promiserPromise: Promise<Worker1Promiser> | null = null;

function createPromiserPromise(): Promise<Worker1Promiser> {
  const factory = sqlite3Worker1Promiser as unknown as
    | (() => Promise<Worker1Promiser>)
    | undefined;

  if (typeof factory !== 'function') {
    throw new Error('sqlite3Worker1Promiser is not available from @sqlite.org/sqlite-wasm.');
  }

  return factory();
}

export async function getSqlitePromiser(): Promise<Worker1Promiser> {
  if (!promiserPromise) {
    promiserPromise = createPromiserPromise()
      .catch((error) => {
        terminateSqliteWorker();
        throw error;
      });
  }

  return promiserPromise;
}

export function terminateSqliteWorker(): void {
  promiserPromise = null;
}
