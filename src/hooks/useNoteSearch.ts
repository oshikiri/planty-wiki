import { useCallback, useRef, useState } from "preact/hooks";

import type { Note, SearchResult } from "../types/note";

type UseNoteSearchArgs = {
  storageSearch?: (query: string) => Promise<SearchResult[]>;
  notes: Note[];
};

const SEARCH_DEBOUNCE_MS = 300;
type NumberRef = { current: number };
type TimeoutRef = { current: number | null };

/**
 * useNoteSearchはクライアント/ストレージ検索をデバウンスしながら実行し、クエリと結果とハンドラを返す。
 *
 * @param params notes配列とstorage.searchNotesをまとめた引数
 * @returns クエリ文字列・検索結果・検索ハンドラ
 */
export function useNoteSearch({ storageSearch, notes }: UseNoteSearchArgs) {
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
          storageSearch,
          notes,
          setResults,
        }).catch((error) => {
          console.warn("Unexpected error while searching notes", error);
        });
      }, SEARCH_DEBOUNCE_MS);
    },
    [notes, storageSearch],
  );

  return { query, results, handleSearch };
}

type ScheduledSearchArgs = {
  nextQuery: string;
  requestId: number;
  latestRequestRef: NumberRef;
  storageSearch?: (query: string) => Promise<SearchResult[]>;
  notes: Note[];
  setResults: (results: SearchResult[] | null) => void;
};

async function runScheduledSearch({
  nextQuery,
  requestId,
  latestRequestRef,
  storageSearch,
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
  const remoteResults = await tryRemoteSearch(trimmed, storageSearch);
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
  storageSearch?: (query: string) => Promise<SearchResult[]>,
) {
  if (typeof storageSearch !== "function") {
    return null;
  }
  try {
    return await storageSearch(query);
  } catch (error) {
    console.warn(
      "Failed to search notes via storage.searchNotes; falling back to client-side filter",
      error,
    );
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
