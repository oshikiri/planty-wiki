import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";

import { Editor } from "./components/editor";
import { QueryPage } from "./components/query-page";
import { Sidebar } from "./components/sidebar";
import { SearchSidebar } from "./components/search-sidebar";
import { normalizePath } from "./navigation";
import { DEFAULT_PAGE_PATH } from "./navigation/constants";
import { formatHashLocation, QUERY_ROUTE, type Route } from "./navigation/route";
import type { Note, PendingSave } from "./types/note";
import { createNoteService, type NoteService } from "./services/note-service";
import { createQueryService } from "./services/query-service";

import { useBacklinks } from "./hooks/useBacklinks";
import { useBootstrapNotes } from "./hooks/useBootstrapNotes";
import { useNoteSearch } from "./hooks/useNoteSearch";
import { useSelectPathHandler } from "./hooks/useSelectPathHandler";
import { useDeleteNote } from "./hooks/useDeleteNote";
import { useAutoSave } from "./hooks/useAutoSave";
import { useHashRouteGuard } from "./hooks/useHashRouteGuard";
import { useStatusMessage } from "./hooks/useStatusMessage";

import styles from "./app.module.css";

const EMPTY_NOTE: Note = { path: "", title: "", body: "" };

/**
 * Planty Wiki全体を束ねるルートコンポーネントを描画する。
 *
 * @returns ルートアプリケーションのJSX
 */
export function App() {
  const [serviceState] = useState<{
    noteService: NoteService | null;
    error: Error | null;
  }>(() => {
    try {
      return { noteService: createNoteService(), error: null };
    } catch (error) {
      return {
        noteService: null,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  });

  const noteService = serviceState.noteService;
  const storageInitError = serviceState.error;
  const queryService = useMemo(() => createQueryService(), []);

  if (!noteService) {
    // 永続ストレージを初期化できなければ通常のUIを出しても保存できないため、明示的に停止する
    return <StorageInitError message={storageInitError?.message} />;
  }
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteRevision, setNoteRevision] = useState(0);
  const [route, setRoute] = useState<Route>({ type: "note", path: DEFAULT_PAGE_PATH });
  const selectedNotePath = route.type === "note" ? route.path : null;
  const [pendingDeletionPath, setPendingDeletionPath] = useState<string | null>(null);
  const notesRef = useRef<Note[]>([]);
  const currentNote = useMemo<Note | null>(() => {
    if (route.type !== "note") {
      return null;
    }
    const found = notes.find((note) => note.path === route.path);
    if (found) {
      return found;
    }
    return {
      path: route.path,
      title: "",
      body: "",
    };
  }, [notes, route]);
  const [draftBody, setDraftBody] = useState<string>("");
  const [statusMessage, setStatusMessage] = useStatusMessage("");
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    if (!currentNote) {
      return;
    }
    // ノート切り替えや初回ロード時に保存済み本文へ同期して、空文字との差分で誤ってisDirty扱いにならないようにする
    setDraftBody(currentNote.body);
  }, [currentNote]);
  useEffect(() => {
    if (route.type !== "query") {
      return;
    }
    setDraftBody("");
  }, [route]);
  const {
    query: searchQuery,
    results: searchResults,
    handleSearch,
  } = useNoteSearch({
    searchNotes: noteService.searchNotes,
    notes,
  });
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const deriveTitle = useCallback((path: string) => deriveTitleFromPath(path), []);
  const sanitizeNoteForSave = useCallback(
    (note: Note): Note => {
      const normalizedPath = normalizePath(note.path || DEFAULT_PAGE_PATH);
      const title = note.title?.trim() || deriveTitle(normalizedPath);
      const body = typeof note.body === "string" ? note.body : "";
      return {
        ...note,
        path: normalizedPath,
        title,
        body,
      };
    },
    [deriveTitle],
  );
  const setNotesFromStorage = useCallback((next: Note[]) => {
    setNotes(next);
    setNoteRevision((revision) => revision + 1);
  }, []);

  useBootstrapNotes({
    defaultPage: DEFAULT_PAGE_PATH,
    deriveTitle,
    sanitizeNoteForSave,
    setNotes,
    setNotesFromStorage,
    setRoute,
    setStatusMessage,
    noteService,
  });

  const handleSelectPath = useSelectPathHandler({
    defaultPage: DEFAULT_PAGE_PATH,
    deriveTitle,
    notes,
    sanitizeNoteForSave,
    setDraftBody,
    setNotes,
    setRoute,
    setStatusMessage,
    noteService,
  });

  const isDirty = currentNote ? draftBody !== currentNote.body : false;

  const backlinks = useBacklinks(notes, currentNote ?? EMPTY_NOTE, noteService);

  const handleChangeDraft = useCallback(
    (nextBody: string) => {
      if (!currentNote) {
        return;
      }
      setDraftBody(nextBody);
      setPendingSave({
        path: currentNote.path,
        title: currentNote.title,
        body: nextBody,
      });
    },
    [currentNote],
  );

  useAutoSave({
    pendingSave,
    sanitizeNoteForSave,
    setPendingSave,
    setNotes,
    saveNote: noteService.saveNote,
    setStatusMessage,
  });

  useHashRouteGuard({
    deriveTitle,
    notesRef,
    sanitizeNoteForSave,
    setNotes,
    setRoute,
    setStatusMessage,
    saveNote: noteService.saveNote,
  });

  const handleImportMarkdown = useCallback(() => {
    noteService.importFromDirectory({
      applyImportedNotes: setNotesFromStorage,
      setStatusMessage,
    });
  }, [noteService, setNotesFromStorage, setStatusMessage]);

  const handleExportMarkdown = useCallback(() => {
    noteService.exportToDirectory({ notes, setStatusMessage });
  }, [noteService, notes, setStatusMessage]);
  const handleOpenQuery = useCallback(() => {
    setRoute(QUERY_ROUTE);
    window.location.hash = formatHashLocation(QUERY_ROUTE);
  }, [setRoute]);

  const handleDeleteNote = useDeleteNote({
    defaultPage: DEFAULT_PAGE_PATH,
    deriveTitle,
    notes,
    pendingDeletionPath,
    sanitizeNoteForSave,
    selectedNotePath,
    setNotes,
    setPendingDeletionPath,
    setPendingSave,
    setRoute,
    setStatusMessage,
    noteService,
  });

  const handleRequestDelete = useCallback((path: string) => {
    setPendingDeletionPath(path);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setPendingDeletionPath(null);
  }, []);

  return (
    <div class={styles.app}>
      <main class={styles.appMain}>
        <Sidebar
          notes={notes}
          selectedPath={selectedNotePath}
          onSelectPath={handleSelectPath}
          onOpenQuery={handleOpenQuery}
          onImportMarkdown={handleImportMarkdown}
          onExportMarkdown={handleExportMarkdown}
          onDeleteNote={handleRequestDelete}
          pendingDeletePath={pendingDeletionPath}
          onCancelDelete={handleCancelDelete}
          onConfirmDelete={handleDeleteNote}
        />
        {route.type === "query" ? (
          <QueryPage runQuery={queryService.runQuery} />
        ) : (
          <Editor
            note={currentNote ?? EMPTY_NOTE}
            noteRevision={noteRevision}
            onChangeDraft={handleChangeDraft}
            statusMessage={statusMessage}
            isDirty={isDirty}
            backlinks={backlinks}
            onSelectPath={handleSelectPath}
          />
        )}
        <SearchSidebar
          searchQuery={searchQuery}
          onChangeSearchQuery={handleSearch}
          searchResults={searchResults}
          onSelectPath={handleSelectPath}
        />
      </main>
    </div>
  );
}

/**
 * deriveTitleFromPathはノートパスの末尾セグメントからタイトルを導出し、空の場合はfallbackを返す。
 *
 * @param path ノートのパス
 * @param fallback パスが空だった場合に返すフォールバック文字列
 * @returns パス末尾を元にしたタイトル
 */
function deriveTitleFromPath(path: string, fallback = "untitled"): string {
  const segments = path.split("/").filter(Boolean);
  return segments.slice(-1)[0] ?? fallback;
}

function StorageInitError({ message }: { message?: string | null }) {
  return (
    <div class={styles.app}>
      <output class={styles.storageWarning} aria-live="polite">
        Persistent storage initialization failed. Please reload with OPFS support enabled.
        {message ? ` (${message})` : ""}
      </output>
    </div>
  );
}
