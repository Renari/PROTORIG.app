declare module '@tursodatabase/database-wasm/bundle' {
  export { Database, SqliteError } from '@tursodatabase/database-common/promise';
  export function connect(path: string, opts?: Record<string, unknown>): Promise<
    import('@tursodatabase/database-common/promise').Database
  >;
}
