import { useId } from "preact/hooks";

import styles from "./search-sidebar.module.css";
import type { SearchResult } from "../types/note";

type SearchSidebarProps = {
  searchQuery: string;
  onChangeSearchQuery: (query: string) => void;
  searchResults: SearchResult[] | null;
  onSelectPath: (path: string) => void;
};

/**
 * Displays the search input and result list, then notifies the parent when a note is selected.
 *
 * @param props.searchQuery Current search text
 * @param props.onChangeSearchQuery Callback that updates the search text
 * @param props.searchResults Result list from the storage-backed search (null when idle)
 * @param props.onSelectPath Handler executed when opening a page from the results
 * @returns JSX for the sidebar section
 */
export function SearchSidebar(props: SearchSidebarProps) {
  const searchInputId = useId();
  const derived = deriveSearchState(props.searchQuery, props.searchResults);
  return (
    <aside class={styles.searchSidebar}>
      <SidebarHeader />
      <SearchInputField
        id={searchInputId}
        value={props.searchQuery}
        onChange={props.onChangeSearchQuery}
      />
      <SearchResultsView {...derived} onSelectPath={props.onSelectPath} />
      <SearchOverflowNotice visible={derived.hasOverflow} />
    </aside>
  );
}

function SidebarHeader() {
  return (
    <header class={styles.header}>
      <h2 class={styles.title}>Search</h2>
    </header>
  );
}

function SearchInputField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <>
      <label class={styles.visuallyHidden} htmlFor={id}>
        Search notes
      </label>
      <input
        id={id}
        class={styles.searchInput}
        type="search"
        placeholder="Search notes"
        value={value}
        onInput={(event) => onChange((event.currentTarget as HTMLInputElement).value)}
      />
    </>
  );
}

function SearchResultsView({
  hasQuery,
  results,
  onSelectPath,
}: {
  hasQuery: boolean;
  results: SearchResult[];
  onSelectPath: (path: string) => void;
}) {
  if (!hasQuery) {
    return <p class={styles.emptyMessage}>Enter a keyword to filter notes</p>;
  }
  if (!results.length) {
    return <p class={styles.emptyMessage}>No matching notes were found</p>;
  }
  return (
    <ul class={styles.resultsList}>
      {results.map((item) => (
        <li key={item.path}>
          <button type="button" class={styles.resultItem} onClick={() => onSelectPath(item.path)}>
            <span class={styles.resultTitle}>{item.title || item.path}</span>
            {item.snippet ? <span class={styles.resultSnippet}>{item.snippet}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function SearchOverflowNotice({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <output class={styles.resultsNotice} aria-live="polite">
      Showing up to 200 results. Narrow the query to see more
    </output>
  );
}

function deriveSearchState(
  query: string,
  results: SearchResult[] | null,
): { hasQuery: boolean; results: SearchResult[]; hasOverflow: boolean } {
  const trimmed = query.trim();
  const hasQuery = Boolean(trimmed);
  if (!hasQuery) {
    return { hasQuery: false, results: [], hasOverflow: false };
  }
  const baseResults = results ?? [];
  const MAX_RENDERED_RESULTS = 200;
  return {
    hasQuery: true,
    results: baseResults.slice(0, MAX_RENDERED_RESULTS),
    hasOverflow: baseResults.length > MAX_RENDERED_RESULTS,
  };
}
