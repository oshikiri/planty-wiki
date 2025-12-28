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
 * SQLiteワーカーにSQLクエリを委譲するQueryServiceを生成する。
 *
 * @returns SQL実行を担うQueryService
 */
export function createQueryService(): QueryService {
  return {
    async runQuery(query: string): Promise<SqlQueryResult> {
      return await callWorker<SqlQueryResult>("runQuery", { query });
    },
  };
}
