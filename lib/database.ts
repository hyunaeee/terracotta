export type SqlValue = string | number | null;

export interface QueryResult<T> {
  results: T[];
  meta: { changes: number };
}

export interface Statement {
  bind(...values: SqlValue[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
  run<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
}

// Shared subset of Cloudflare D1 and libSQL used by Terracotta's repositories.
export interface Database {
  prepare(sql: string): Statement;
  batch<T = unknown>(statements: Statement[]): Promise<QueryResult<T>[]>;
}
