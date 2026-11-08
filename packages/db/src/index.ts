import pg from 'pg';
import type { PoolConfig } from 'pg';
import { isRetryable, mapDbError } from './errors.ts';

export { isPgError, isRetryable, mapDbError, type PgErrorLike } from './errors.ts';
export { MIGRATIONS_DIR, loadMigrations, migrate, type MigrationFile, type MigrationReport } from './migrate.ts';

export interface QueryResult<R> {
  rows: R[];
  rowCount: number;
}

/** Anything that can run a query: the pool, or a transaction. */
export interface Queryable {
  query<R = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
}

export type IsolationLevel = 'read committed' | 'repeatable read' | 'serializable';

export interface TransactionOptions {
  isolation?: IsolationLevel;
  /** How many times to run the transaction again after a serialization failure or deadlock. */
  retries?: number;
}

/** What a pg Pool and a pg PoolClient have in common. */
interface PgQueryable {
  query<R = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

export interface Db extends Queryable {
  transaction<T>(work: (tx: Queryable) => Promise<T>, options?: TransactionOptions): Promise<T>;
  close(): Promise<void>;
}

export interface DbOptions {
  connectionString: string;
  /** Maximum pooled connections (default 10). */
  max?: number;
  /** Use TLS. `true` verifies the server certificate; pass an object to customise. */
  ssl?: boolean | { rejectUnauthorized?: boolean; ca?: string };
  applicationName?: string;
  statementTimeoutMs?: number;
  idleInTransactionTimeoutMs?: number;
  onError?: (error: Error) => void;
}

export function createDb(options: DbOptions): Db {
  const config: PoolConfig = {
    connectionString: options.connectionString,
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'aurum',
    statement_timeout: options.statementTimeoutMs ?? 15_000,
    idle_in_transaction_session_timeout: options.idleInTransactionTimeoutMs ?? 30_000,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  };
  if (options.ssl !== undefined) config.ssl = options.ssl;
  const pool = new pg.Pool(config);
  // an idle connection that breaks must not crash the process
  pool.on('error', (error) => options.onError?.(error));

  const wrap = (q: PgQueryable): Queryable => ({
    async query<R>(text: string, values?: readonly unknown[]) {
      // pg returns an ARRAY of results when one call runs several statements (a migration file,
      // for example): report the last statement, like psql does.
      const raw: unknown = await q.query<R>(text, values);
      const result = (Array.isArray(raw) ? raw[raw.length - 1] : raw) as { rows: R[]; rowCount: number | null } | undefined;
      const rows = result?.rows ?? [];
      return { rows, rowCount: result?.rowCount ?? rows.length };
    },
  });
  const poolQueryable = wrap(pool);

  async function runOnce<T>(work: (tx: Queryable) => Promise<T>, isolation: IsolationLevel): Promise<T> {
    const client = await pool.connect();
    let destroy = false;
    try {
      await client.query(`begin isolation level ${isolation}`);
      const tx = wrap(client);
      const value = await work(tx);
      await client.query('commit');
      return value;
    } catch (error) {
      try {
        await client.query('rollback');
      } catch {
        destroy = true; // the connection is unusable: do not return it to the pool
      }
      throw error;
    } finally {
      client.release(destroy);
    }
  }

  return {
    query: poolQueryable.query,
    async transaction<T>(work: (tx: Queryable) => Promise<T>, opts: TransactionOptions = {}): Promise<T> {
      const isolation = opts.isolation ?? 'read committed';
      const retries = opts.retries ?? (isolation === 'read committed' ? 1 : 3);
      for (let attempt = 0; ; attempt++) {
        try {
          return await runOnce(work, isolation);
        } catch (error) {
          if (attempt < retries && isRetryable(error)) continue;
          throw mapDbError(error) ?? error;
        }
      }
    },
    close: () => pool.end(),
  };
}
