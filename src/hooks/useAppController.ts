import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type StateUpdater,
} from "preact/hooks";

import { DEFAULT_PAGE_PATH } from "../navigation/constants";
import { QUERY_ROUTE, type Route } from "../navigation/route";
import type { Note, PendingSave, SearchResult } from "../types/note";
import type { NoteService } from "../services/note-service";
import type { Router } from "../navigation/router";
import { buildNote, deriveTitleFromPath } from "../domain/note";

import { useBacklinks, type Backlink } from "./useBacklinks";
import { useBootstrapNotes } from "./useBootstrapNotes";
import { useNoteSearch } from "./useNoteSearch";
import { useSelectPathHandler } from "./useSelectPathHandler";
import { useDeleteNote } from "./useDeleteNote";
import { useAutoSave } from "./useAutoSave";
import { useHashRouteGuard } from "./useHashRouteGuard";
import { useStatusMessage } from "./useStatusMessage";

const EMPTY_NOTE: Note = { path: "", title: "", body: "" };

type UseAppControllerParams = {
  noteService: NoteService;
  router: Router;
};

type UseAppControllerResult = {
  notes: Note[];
  noteRevision: number;
  route: Route;
  selectedNotePath: string | null;
  pendingDeletionPath: string | null;
  statusMessage: string;
  searchQuery: string;
  searchResults: SearchResult[] | null;
  editorNote: Note;
  isDirty: boolean;
  backlinks: Backlink[];
  handleSearch: (query: string) => void;
  handleSelectPath: (path: string) => void;
  handleOpenQuery: () => void;
  handleImportMarkdown: () => Promise<void>;
  handleExportMarkdown: () => Promise<void>;
  handleChangeDraft: (nextBody: string) => void;
  handleRequestDelete: (path: string) => void;
  handleCancelDelete: () => void;
  handleDeleteNote: () => Promise<void>;
};

/**
 * Centralizes the App component state and handlers for easier orchestration.
 *
 * @param params Dependencies such as NoteService and Router
 * @returns UI state and event handlers consumed by the App component
 */
export function useAppController({
  noteService,
  router,
}: UseAppControllerParams): UseAppControllerResult {
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteRevision, setNoteRevision] = useState(0);
  const [route, setRoute] = useState<Route>(
    () => router.getCurrentRoute() ?? { type: "note", path: DEFAULT_PAGE_PATH },
  );
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
  const { statusMessage, setStatusMessage, showTemporaryStatus } = useTemporaryStatus("");
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    if (!currentNote) {
      return;
    }
    // Sync editor body with the stored note to avoid false positive isDirty states on load or note switch.
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
    router,
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
    router,
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
    router,
  });

  const { handleImportMarkdown, handleExportMarkdown } = useMarkdownTransfer({
    noteService,
    notes,
    setNotesFromStorage,
    showTemporaryStatus,
  });

  const handleOpenQuery = useCallback(() => {
    setRoute(QUERY_ROUTE);
    router.navigate(QUERY_ROUTE);
  }, [router, setRoute]);

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
    router,
  });

  const handleRequestDelete = useCallback((path: string) => {
    setPendingDeletionPath(path);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setPendingDeletionPath(null);
  }, []);

  return {
    notes,
    noteRevision,
    route,
    selectedNotePath,
    pendingDeletionPath,
    statusMessage,
    searchQuery,
    searchResults,
    editorNote: currentNote ?? EMPTY_NOTE,
    isDirty,
    backlinks,
    handleSearch,
    handleSelectPath,
    handleOpenQuery,
    handleImportMarkdown,
    handleExportMarkdown,
    handleChangeDraft,
    handleRequestDelete,
    handleCancelDelete,
    handleDeleteNote,
  };
}

function useTemporaryStatus(initialMessage: string): {
  statusMessage: string;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  showTemporaryStatus: (message: string) => void;
} {
  const [statusMessage, setStatusMessage] = useStatusMessage(initialMessage);
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
    return () => {
      if (statusResetTimerRef.current !== null) {
        window.clearTimeout(statusResetTimerRef.current);
      }
    };
  }, []);
  return { statusMessage, setStatusMessage, showTemporaryStatus };
}

function useMarkdownTransfer({
  noteService,
  notes,
  setNotesFromStorage,
  showTemporaryStatus,
}: {
  noteService: NoteService;
  notes: Note[];
  setNotesFromStorage: (next: Note[]) => void;
  showTemporaryStatus: (message: string) => void;
}): {
  handleImportMarkdown: () => Promise<void>;
  handleExportMarkdown: () => Promise<void>;
} {
  const handleImportMarkdown = useCallback(async () => {
    try {
      const result = await noteService.importFromDirectory();
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
    } catch (error) {
      console.error("Failed to import Markdown notes", error);
      showTemporaryStatus("Failed to import Markdown notes");
    }
  }, [noteService, setNotesFromStorage, showTemporaryStatus]);

  const handleExportMarkdown = useCallback(async () => {
    try {
      const result = await noteService.exportToDirectory(notes);
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
    } catch (error) {
      console.error("Failed to export Markdown notes", error);
      showTemporaryStatus("Failed to export Markdown notes");
    }
  }, [noteService, notes, showTemporaryStatus]);

  return { handleImportMarkdown, handleExportMarkdown };
}
