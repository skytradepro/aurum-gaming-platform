/**
 * Minimal type declarations for the parts of node-postgres ("pg") that Aurum uses.
 * Kept local so the project type-checks without @types/pg. If @types/pg is installed,
 * this ambient declaration simply takes precedence.
 */
declare module 'pg' {
  export interface QueryResult<R = Record<string, unknown>> {
    rows: R[];
    rowCount: number | null;
    command: string;
  }

  export interface PoolClient {
    query<R = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
    release(destroy?: boolean | Error): void;
    /** Server notices (RAISE NOTICE). Present on the real client; used by the SQL test runner. */
    on?(event: 'notice', listener: (notice: { message: string }) => void): this;
  }

  export interface PoolConfig {
    connectionString?: string;
    max?: number;
    ssl?: boolean | { rejectUnauthorized?: boolean; ca?: string };
    application_name?: string;
    statement_timeout?: number;
    idle_in_transaction_session_timeout?: number;
    connectionTimeoutMillis?: number;
    idleTimeoutMillis?: number;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    connect(): Promise<PoolClient>;
    query<R = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
    end(): Promise<void>;
    on(event: 'error', listener: (error: Error) => void): this;
  }

  export class DatabaseError extends Error {
    code?: string;
    constraint?: string;
    detail?: string;
    table?: string;
    column?: string;
  }

  const pg: { Pool: typeof Pool; DatabaseError: typeof DatabaseError };
  export default pg;
}
