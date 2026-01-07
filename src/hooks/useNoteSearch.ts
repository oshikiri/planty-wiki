import { useCallback, useRef, useState } from "preact/hooks";

import type { SearchResult } from "../types/note";

type UseNoteSearchArgs = {
  searchNotes?: (query: string) => Promise<SearchResult[]>;
};

const SEARCH_DEBOUNCE_MS = 300;
type NumberRef = { current: number };
type TimeoutRef = { current: number | null };

/**
 * Debounces client/service note searches while returning the query, latest results, and handler.
 *
 * @param params Object that bundles the optional searchNotes function
 * @returns Query string, results, and the search handler
 */
export function useNoteSearch({ searchNotes }: UseNoteSearchArgs) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const debounceRef = useRef<number | null>(null);
  const latestRequestRef = useRef(0);

  const handleSearch = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery);
      resetDebounce(debounceRef);
      const requestId = ++latestRequestRef.current;
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        runScheduledSearch({
          nextQuery,
          requestId,
          latestRequestRef,
          searchNotes,
          setResults,
        }).catch((error) => {
          console.warn("Unexpected error while searching notes", error);
        });
      }, SEARCH_DEBOUNCE_MS);
    },
    [searchNotes],
  );

  return { query, results, handleSearch };
}

type ScheduledSearchArgs = {
  nextQuery: string;
  requestId: number;
  latestRequestRef: NumberRef;
  searchNotes?: (query: string) => Promise<SearchResult[]>;
  setResults: (results: SearchResult[] | null) => void;
};

async function runScheduledSearch({
  nextQuery,
  requestId,
  latestRequestRef,
  searchNotes,
  setResults,
}: ScheduledSearchArgs) {
  const trimmed = nextQuery.trim();
  if (!trimmed) {
    if (requestId === latestRequestRef.current) {
      setResults(null);
    }
    return;
  }
  const remoteResults = await tryRemoteSearch(trimmed, searchNotes);
  if (requestId !== latestRequestRef.current) {
    return;
  }
  setResults(remoteResults ?? []);
}

async function tryRemoteSearch(
  query: string,
  searchNotes?: (query: string) => Promise<SearchResult[]>,
) {
  if (typeof searchNotes !== "function") {
    return null;
  }
  try {
    return await searchNotes(query);
  } catch (error) {
    console.warn("Failed to search notes via service", error);
    return null;
  }
}

function resetDebounce(ref: TimeoutRef) {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
  }
}
