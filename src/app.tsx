import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";

import { Editor } from "./components/editor";
import { QueryPage } from "./components/query-page";
import { Sidebar } from "./components/sidebar";
import { SearchSidebar } from "./components/search-sidebar";
import { DEFAULT_PAGE_PATH } from "./navigation/constants";
import { formatHashLocation, QUERY_ROUTE, type Route } from "./navigation/route";
import type { Note, PendingSave } from "./types/note";
import type { NoteService } from "./services/note-service";
import { createQueryService } from "./services/query-service";
import { buildNote, deriveTitleFromPath } from "./domain/note";

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

type AppProps = {
  noteService: NoteService;
};

/**
 * Planty Wiki全体を束ねるルートコンポーネントを描画する。
 *
 * @param props 依存関係としてのNoteService
 * @returns ルートアプリケーションのJSX
 */
export function App({ noteService }: AppProps) {
  const queryService = useMemo(() => createQueryService(), []);
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
  const statusResetTimerRef = useRef<number | null>(null);
  const showTemporaryStatus = useCallback(
    (message: string) => {
      setStatusMessage(message);
      if (statusResetTimerRef.current !== null) {
        window.clearTimeout(statusResetTimerRef.current);
      }
      statusResetTimerRef.current = window.setTimeout(() => {
        setStatusMessage("");
        statusResetTimerRef.current = null;
      }, 2000);
    },
    [setStatusMessage],
  );
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    return () => {
      if (statusResetTimerRef.current !== null) {
        window.clearTimeout(statusResetTimerRef.current);
      }
    };
  }, []);
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
    (note: Note): Note => buildNote({ ...note, path: note.path || DEFAULT_PAGE_PATH }),
    [],
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
    noteService
      .importFromDirectory()
      .then((result) => {
        if (result.status === "success") {
          setNotesFromStorage(result.notes);
          showTemporaryStatus(`Imported ${result.importedCount} notes from folder`);
          return;
        }
        if (result.status === "no-markdown") {
          showTemporaryStatus("No Markdown files found in the selected folder");
          return;
        }
        if (result.status === "unsupported") {
          showTemporaryStatus("This browser does not support directory access");
          return;
        }
        showTemporaryStatus("Failed to import Markdown notes");
      })
      .catch((error) => {
        console.error("Failed to import Markdown notes", error);
        showTemporaryStatus("Failed to import Markdown notes");
      });
  }, [noteService, setNotesFromStorage, showTemporaryStatus]);

  const handleExportMarkdown = useCallback(() => {
    noteService
      .exportToDirectory(notes)
      .then((result) => {
        if (result.status === "success") {
          showTemporaryStatus(`Exported ${result.exportedCount} notes to folder`);
          return;
        }
        if (result.status === "no-notes") {
          showTemporaryStatus("No notes to export");
          return;
        }
        if (result.status === "unsupported") {
          showTemporaryStatus("This browser does not support directory access");
          return;
        }
        showTemporaryStatus("Failed to export Markdown notes");
      })
      .catch((error) => {
        console.error("Failed to export Markdown notes", error);
        showTemporaryStatus("Failed to export Markdown notes");
      });
  }, [noteService, notes, showTemporaryStatus]);
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
 * ストレージ初期化失敗時にエラーメッセージを描画する。
 *
 * @param props ブラウザ環境から受け取った例外メッセージ
 * @returns エラー表示用のUI
 */
export function StorageInitError({ message }: { message?: string | null }) {
  return (
    <div class={styles.app}>
      <output class={styles.storageWarning} aria-live="polite">
        Persistent storage initialization failed. Please reload with OPFS support enabled.
        {message ? ` (${message})` : ""}
      </output>
    </div>
  );
}
