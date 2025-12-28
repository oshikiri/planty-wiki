import { useCallback, useMemo, useState } from "preact/hooks";

import type { SqlQueryResult } from "../services/query-service";

import styles from "./query-page.module.css";

type QueryPageProps = {
  runQuery: (query: string) => Promise<SqlQueryResult>;
};

type QueryFormProps = {
  query: string;
  isRunning: boolean;
  onChangeQuery: (value: string) => void;
  onSubmit: (event: Event) => void;
};

type QueryResultProps = {
  result: SqlQueryResult;
  columns: string[];
};

/**
 * QueryPageはSQLクエリの実行フォームと結果テーブルを描画する。
 *
 * @param props.runQuery SQLクエリを実行する非同期関数
 * @returns クエリ実行ページのJSX
 */
export function QueryPage({ runQuery }: QueryPageProps) {
  const [query, setQuery] = useState("SELECT path, title FROM pages LIMIT 10");
  const [result, setResult] = useState<SqlQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const columns = useMemo(() => deriveColumns(result), [result]);
  const handleSubmit = useCallback(
    async (event: Event) => {
      event.preventDefault();
      setIsRunning(true);
      setError(null);
      try {
        const nextResult = await runQuery(query);
        setResult(nextResult);
      } catch (queryError) {
        const message = queryError instanceof Error ? queryError.message : String(queryError);
        setError(message);
        setResult(null);
      } finally {
        setIsRunning(false);
      }
    },
    [query, runQuery],
  );

  return (
    <section class={styles.queryPage}>
      <header class={styles.queryHeader}>
        <h2 class={styles.queryTitle}>SQL Query</h2>
        <p class={styles.queryDescription}>Only SELECT or WITH queries are supported.</p>
      </header>
      <QueryForm
        query={query}
        isRunning={isRunning}
        onChangeQuery={setQuery}
        onSubmit={handleSubmit}
      />
      {error ? <output class={styles.queryError}>{error}</output> : null}
      {result ? <QueryResult result={result} columns={columns} /> : null}
    </section>
  );
}

function QueryForm({ query, isRunning, onChangeQuery, onSubmit }: QueryFormProps) {
  return (
    <form class={styles.queryForm} onSubmit={onSubmit}>
      <label class={styles.queryLabel} htmlFor="sql-query-input">
        Query
      </label>
      <textarea
        id="sql-query-input"
        class={styles.queryTextarea}
        value={query}
        onInput={(event) => onChangeQuery((event.target as HTMLTextAreaElement).value)}
        rows={6}
      />
      <div class={styles.queryActions}>
        <button type="submit" class={styles.queryButton} disabled={isRunning}>
          {isRunning ? "Running..." : "Run Query"}
        </button>
      </div>
    </form>
  );
}

function QueryResult({ result, columns }: QueryResultProps) {
  return (
    <div class={styles.queryResult}>
      {result.rows.length === 0 ? (
        <p class={styles.queryEmpty}>No rows returned.</p>
      ) : (
        <div class={styles.queryTableWrap}>
          <table class={styles.queryTable}>
            <caption class={styles.queryCaption}>Query Result</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th scope="col" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {row.map((value, columnIndex) => (
                    <td key={`cell-${rowIndex}-${columnIndex}`}>{formatCellValue(value)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.truncated ? (
        <p class={styles.queryHint}>Results were truncated to 200 rows.</p>
      ) : null}
    </div>
  );
}

function deriveColumns(result: SqlQueryResult | null): string[] {
  if (!result) {
    return [];
  }
  if (result.columns.length > 0) {
    return result.columns;
  }
  const firstRow = result.rows[0];
  if (!firstRow) {
    return [];
  }
  return firstRow.map((_, index) => `Column ${index + 1}`);
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
