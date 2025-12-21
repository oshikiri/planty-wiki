import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";

import { Editor } from "./components/editor";
import { Sidebar } from "./components/sidebar";
import { SearchSidebar } from "./components/search-sidebar";
import { normalizePath } from "./navigation";
import type { Note, PendingSave } from "./types/note";
import { createStorage, type NoteStorage } from "./storage";
import { exportNotesToDirectory, importMarkdownFromDirectory } from "./storage/file-bridge";

import { useBacklinks } from "./hooks/useBacklinks";
import { useBootstrapNotes } from "./hooks/useBootstrapNotes";
import { useNoteSearch } from "./hooks/useNoteSearch";
import { useSelectPathHandler } from "./hooks/useSelectPathHandler";
import { useDeleteNote } from "./hooks/useDeleteNote";
import { useAutoSave } from "./hooks/useAutoSave";
import { useHashRouteGuard } from "./hooks/useHashRouteGuard";
import { useStatusMessage } from "./hooks/useStatusMessage";

import styles from "./app.module.css";

const DEFAULT_PAGE = "/pages/index";

/**
 * Planty Wiki全体を束ねるルートコンポーネントを描画する。
 *
 * @returns ルートアプリケーションのJSX
 */
export function App() {
  const [storageState] = useState<{
    storage: NoteStorage | null;
    error: Error | null;
  }>(() => {
    try {
      return { storage: createStorage(), error: null };
    } catch (error) {
      return {
        storage: null,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  });

  const storageFromState = storageState.storage;
  const storageInitError = storageState.error;

  if (!storageFromState) {
    // 永続ストレージを初期化できなければ通常のUIを出しても保存できないため、明示的に停止する
    return <StorageInitError message={storageInitError?.message} />;
  }
  const storage = storageFromState;
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteRevision, setNoteRevision] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string>(DEFAULT_PAGE);
  const [pendingDeletionPath, setPendingDeletionPath] = useState<string | null>(null);
  const notesRef = useRef<Note[]>([]);
  const current = useMemo<Note>(() => {
    const found = notes.find((note) => note.path === selectedPath);
    if (found) {
      return found;
    }
    return {
      path: selectedPath,
      title: "",
      body: "",
    };
  }, [notes, selectedPath]);
  const [draftBody, setDraftBody] = useState<string>("");
  const [statusMessage, setStatusMessage] = useStatusMessage("");
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    // ノート切り替えや初回ロード時に保存済み本文へ同期して、空文字との差分で誤ってisDirty扱いにならないようにする
    setDraftBody(current.body);
  }, [current.body, current.path]);
  const {
    query: searchQuery,
    results: searchResults,
    handleSearch,
  } = useNoteSearch({
    storageSearch: storage.searchNotes,
    notes,
  });
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const deriveTitle = useCallback((path: string) => deriveTitleFromPath(path), []);
  const sanitizeNoteForSave = useCallback(
    (note: Note): Note => {
      const normalizedPath = normalizePath(note.path || DEFAULT_PAGE);
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
    defaultPage: DEFAULT_PAGE,
    deriveTitle,
    sanitizeNoteForSave,
    setNotes,
    setNotesFromStorage,
    setSelectedPath,
    setStatusMessage,
    storage,
  });

  const handleSelectPath = useSelectPathHandler({
    defaultPage: DEFAULT_PAGE,
    deriveTitle,
    notes,
    sanitizeNoteForSave,
    setDraftBody,
    setNotes,
    setSelectedPath,
    setStatusMessage,
    storage,
  });

  const isDirty = draftBody !== current.body;

  const backlinks = useBacklinks(notes, current, storage);

  const handleChangeDraft = useCallback(
    (nextBody: string) => {
      setDraftBody(nextBody);
      setPendingSave({
        path: current.path,
        title: current.title,
        body: nextBody,
      });
    },
    [current],
  );

  useAutoSave({
    pendingSave,
    sanitizeNoteForSave,
    setPendingSave,
    setNotes,
    storageSave: storage.saveNote,
    setStatusMessage,
  });

  useHashRouteGuard({
    deriveTitle,
    notesRef,
    sanitizeNoteForSave,
    setNotes,
    setSelectedPath,
    setStatusMessage,
    storageSave: storage.saveNote,
  });

  const handleImportMarkdown = useCallback(() => {
    importMarkdownFromDirectory(storage, setNotesFromStorage, setStatusMessage);
  }, [storage, setNotesFromStorage, setStatusMessage]);

  const handleExportMarkdown = useCallback(() => {
    exportNotesToDirectory(notes, setStatusMessage);
  }, [notes]);

  const handleDeleteNote = useDeleteNote({
    defaultPage: DEFAULT_PAGE,
    deriveTitle,
    notes,
    pendingDeletionPath,
    sanitizeNoteForSave,
    selectedPath,
    setNotes,
    setPendingDeletionPath,
    setPendingSave,
    setSelectedPath,
    setStatusMessage,
    storage,
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
          selectedPath={selectedPath}
          onSelectPath={handleSelectPath}
          onImportMarkdown={handleImportMarkdown}
          onExportMarkdown={handleExportMarkdown}
          onDeleteNote={handleRequestDelete}
          pendingDeletePath={pendingDeletionPath}
          onCancelDelete={handleCancelDelete}
          onConfirmDelete={handleDeleteNote}
        />
        <Editor
          note={current}
          noteRevision={noteRevision}
          onChangeDraft={handleChangeDraft}
          statusMessage={statusMessage}
          isDirty={isDirty}
          backlinks={backlinks}
          onSelectPath={handleSelectPath}
        />
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
