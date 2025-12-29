import { callWorker } from "../storage/sqlite-worker-client";

export type SqlQueryResult = {
  columns: string[];
  rows: Array<Array<unknown>>;
  truncated: boolean;
};

export type QueryService = {
  runQuery: (query: string) => Promise<SqlQueryResult>;
};

/**
 * Creates a QueryService that delegates SQL execution to the SQLite worker.
 *
 * @returns QueryService responsible for running SQL
 */
export function createQueryService(): QueryService {
  return {
    async runQuery(query: string): Promise<SqlQueryResult> {
      return await callWorker<SqlQueryResult>("runQuery", { query });
    },
  };
}
