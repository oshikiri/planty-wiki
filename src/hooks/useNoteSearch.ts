import { useCallback, useRef, useState } from "preact/hooks";

import type { Note, SearchResult } from "../types/note";

type UseNoteSearchArgs = {
  searchNotes?: (query: string) => Promise<SearchResult[]>;
  notes: Note[];
};

const SEARCH_DEBOUNCE_MS = 300;
type NumberRef = { current: number };
type TimeoutRef = { current: number | null };

/**
 * Debounces client/service note searches while returning the query, latest results, and handler.
 *
 * @param params Object that bundles the notes array and optional searchNotes function
 * @returns Query string, results, and the search handler
 */
export function useNoteSearch({ searchNotes, notes }: UseNoteSearchArgs) {
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
          notes,
          setResults,
        }).catch((error) => {
          console.warn("Unexpected error while searching notes", error);
        });
      }, SEARCH_DEBOUNCE_MS);
    },
    [notes, searchNotes],
  );

  return { query, results, handleSearch };
}

type ScheduledSearchArgs = {
  nextQuery: string;
  requestId: number;
  latestRequestRef: NumberRef;
  searchNotes?: (query: string) => Promise<SearchResult[]>;
  notes: Note[];
  setResults: (results: SearchResult[] | null) => void;
};

async function runScheduledSearch({
  nextQuery,
  requestId,
  latestRequestRef,
  searchNotes,
  notes,
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
  if (remoteResults?.length) {
    setResults(remoteResults);
    return;
  }
  setResults(filterNotes(notes, trimmed));
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
    console.warn("Failed to search notes via service; falling back to client-side filter", error);
    return null;
  }
}

function filterNotes(notes: Note[], query: string): SearchResult[] {
  return notes
    .filter((note) => note.title.includes(query) || note.body.includes(query))
    .map((note) => ({
      path: note.path,
      title: note.title,
      snippet: "",
    }));
}

function resetDebounce(ref: TimeoutRef) {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
  }
}
