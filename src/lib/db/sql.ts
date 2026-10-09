/**
 * Minimal SQL executor contract shared by every local database backend.
 *
 * PGlite (preview/dev), the `pg` pool (a real PostgreSQL URL) and the Phase 6
 * integration harness all satisfy this shape, which is what lets the
 * PostgREST-compatible shim sit on top of any of them without caring which
 * one is running.
 */
export interface SqlResult<T> {
  rows: T[];
  affectedRows?: number;
}

export interface SqlExecutor {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlResult<T>>;
}
