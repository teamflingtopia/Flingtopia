export type Row = Record<string, unknown>;
export interface QueryResult<T extends Row = Row> {
  rows: T[];
}
export interface Executor {
  query<T extends Row = Row>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
  exec(sql: string): Promise<unknown>;
}
export interface Database extends Executor {
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export interface DatabaseOptions {
  url?: string;
  directory?: string;
  ssl?: boolean;
  migrate?: boolean;
}
