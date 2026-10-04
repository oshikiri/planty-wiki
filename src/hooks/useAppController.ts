import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type StateUpdater,
} from "preact/hooks";

import { DEFAULT_PAGE_PATH } from "../navigation/constants";
import { QUERY_ROUTE, type Route } from "../navigation/route";
import type { Note, PendingSave } from "../types/note";
import type { NoteService } from "../services/note-service";
import type { ImportMarkdownResult } from "../storage/file-bridge";
import type { Router } from "../navigation/router";
import { buildNote, deriveTitleFromPath } from "../domain/note";
import { DEFAULT_README_MARKDOWN, resolveBundledDocBody } from "../defaults/initial-docs";

import { useBacklinks, type Backlink } from "./useBacklinks";
import { useBootstrapNotes } from "./useBootstrapNotes";
import { useSelectPathHandler } from "./useSelectPathHandler";
import { useDeleteNote } from "./useDeleteNote";
import { useAutoSave } from "./useAutoSave";
import { useHashRouteGuard } from "./useHashRouteGuard";
import { useSyncNoteUpdates } from "./useSyncNoteUpdates";
import { useStatusMessage } from "./useStatusMessage";

const EMPTY_NOTE: Note = { path: "", title: "", body: "" };

type UseAppControllerParams = {
  noteService: NoteService;
  router: Router;
};

type UseAppControllerResult = {
  noteRevision: number;
  noteListRevision: number;
  route: Route;
  selectedNotePath: string | null;
  pendingDeletionPath: string | null;
  statusMessage: string;
  editorNote: Note;
  isDirty: boolean;
  backlinks: Backlink[];
  handleSelectPath: (path: string) => void;
  handleOpenQuery: () => void;
  handleImportMarkdown: () => Promise<void>;
  handleCancelImport: () => void;
  isImporting: boolean;
  canCancelImport: boolean;
  isResolvingConflict: boolean;
  canResolveConflict: boolean;
  handleResolveSyncConflict: (
    noteId: string,
    choice: "local" | "server",
    path?: string,
  ) => Promise<void>;
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
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: This hook intentionally centralizes app-level orchestration.
export function useAppController({
  noteService,
  router,
}: UseAppControllerParams): UseAppControllerResult {
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [noteRevision, setNoteRevision] = useState(0);
  const [noteListRevision, setNoteListRevision] = useState(0);
  const [route, setRoute] = useState<Route>(
    () => router.getCurrentRoute() ?? { type: "note", path: DEFAULT_PAGE_PATH },
  );
  const selectedNotePath = route.type === "note" ? route.path : null;
  const [pendingDeletionPath, setPendingDeletionPath] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState<string>("");
  const incrementNoteRevision = useCallback(() => {
    setNoteRevision((revision) => revision + 1);
  }, []);
  const incrementNoteListRevision = useCallback(() => {
    setNoteListRevision((revision) => revision + 1);
  }, []);
  const { statusMessage, setStatusMessage, showTemporaryStatus } = useTemporaryStatus("");
  const deriveTitle = useCallback((path: string) => deriveTitleFromPath(path), []);
  const sanitizeNoteForSave = useCallback(
    (note: Note): Note => buildNote({ ...note, path: note.path || DEFAULT_PAGE_PATH }),
    [],
  );
  useEffect(() => {
    if (!currentNote) {
      return;
    }
    // Sync editor body with the stored note to avoid false positive isDirty states on load or note switch.
    setDraftBody(currentNote.body);
  }, [currentNote]);
  useEffect(() => {
    if (route.type !== "note") {
      setCurrentNote(null);
      setDraftBody("");
      return;
    }
    if (currentNote && currentNote.path === route.path) {
      return;
    }
    let cancelled = false;
    noteService
      .loadNote(route.path)
      .then((note) => {
        if (cancelled) {
          return;
        }
        if (note) {
          setCurrentNote(applyBundledDocBody(note));
          incrementNoteRevision();
          return;
        }
        const fallback = sanitizeNoteForSave({
          path: route.path,
          title: deriveTitle(route.path),
          body: resolveBundledDocBody(route.path) ?? "",
        });
        setCurrentNote(applyBundledDocBody(fallback));
        incrementNoteRevision();
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error("Failed to load note", error);
        setStatusMessage("Failed to load note");
      });
    return () => {
      cancelled = true;
    };
  }, [
    route,
    currentNote,
    noteService,
    resolveBundledDocBody,
    sanitizeNoteForSave,
    deriveTitle,
    incrementNoteRevision,
    setStatusMessage,
  ]);
  useEffect(() => {
    if (route.type !== "query") {
      return;
    }
    setDraftBody("");
  }, [route]);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);
  const resolvingConflictRef = useRef(false);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  useBootstrapNotes({
    defaultPage: DEFAULT_PAGE_PATH,
    defaultNoteBody: DEFAULT_README_MARKDOWN,
    resolveBundledDocBody,
    deriveTitle,
    sanitizeNoteForSave,
    setCurrentNote,
    incrementNoteRevision,
    incrementNoteListRevision,
    setRoute,
    setStatusMessage,
    noteService,
    router,
  });

  const handleSelectPath = useSelectPathHandler({
    defaultPage: DEFAULT_PAGE_PATH,
    deriveTitle,
    sanitizeNoteForSave,
    resolveBundledDocBody,
    setDraftBody,
    setCurrentNote,
    incrementNoteRevision,
    incrementNoteListRevision,
    setRoute,
    setStatusMessage,
    noteService,
    router,
  });

  const isDirty = currentNote ? draftBody !== currentNote.body : false;

  const backlinks = useBacklinks(currentNote ?? EMPTY_NOTE, noteService);

  const handleChangeDraft = useCallback(
    (nextBody: string) => {
      if (!currentNote || resolvingConflictRef.current) {
        return;
      }
      if (nextBody === currentNote.body && nextBody === draftBody) return;
      setDraftBody(nextBody);
      setPendingSave({
        path: currentNote.path,
        title: currentNote.title,
        body: nextBody,
      });
    },
    [currentNote, draftBody],
  );

  const hasPendingSave = useAutoSave({
    pendingSave,
    sanitizeNoteForSave,
    setPendingSave,
    setCurrentNote,
    saveNote: noteService.saveNote,
    setStatusMessage,
    notifyNotePersisted: incrementNoteListRevision,
  });

  useSyncNoteUpdates({
    noteService,
    router,
    route,
    currentNote,
    hasPendingChanges: hasPendingSave || isDirty || isResolvingConflict,
    setCurrentNote,
    setDraftBody,
    setRoute,
    incrementNoteRevision,
    incrementNoteListRevision,
    setStatusMessage,
  });
  const handleResolveSyncConflict = useCallback(
    async (noteId: string, choice: "local" | "server", path?: string) => {
      if (hasPendingSave || isDirty || resolvingConflictRef.current) {
        throw new Error("Wait for local changes to finish saving before resolving the conflict");
      }
      resolvingConflictRef.current = true;
      setIsResolvingConflict(true);
      try {
        await noteService.resolveSyncConflict(noteId, choice, path);
      } finally {
        resolvingConflictRef.current = false;
        setIsResolvingConflict(false);
      }
    },
    [hasPendingSave, isDirty, noteService],
  );

  useHashRouteGuard({
    deriveTitle,
    sanitizeNoteForSave,
    resolveBundledDocBody,
    setRoute,
    setStatusMessage,
    noteService,
    router,
    notifyNoteListRevision: incrementNoteListRevision,
  });

  const {
    handleImportMarkdown,
    handleCancelImport,
    isImporting,
    canCancelImport,
    handleExportMarkdown,
  } = useMarkdownTransfer({
    noteService,
    notifyNoteListRevision: incrementNoteListRevision,
    showTemporaryStatus,
  });

  const handleOpenQuery = useCallback(() => {
    setRoute(QUERY_ROUTE);
    router.navigate(QUERY_ROUTE);
  }, [router, setRoute]);

  const handleDeleteNote = useDeleteNote({
    defaultPage: DEFAULT_PAGE_PATH,
    deriveTitle,
    pendingDeletionPath,
    pendingSave,
    sanitizeNoteForSave,
    selectedNotePath,
    setPendingDeletionPath,
    setPendingSave,
    setCurrentNote,
    incrementNoteRevision,
    incrementNoteListRevision,
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

  function applyBundledDocBody(note: Note): Note {
    const bundledBody = resolveBundledDocBody(note.path);
    if (bundledBody === null || note.body === bundledBody) {
      return note;
    }
    return { ...note, body: bundledBody };
  }

  return {
    noteRevision,
    noteListRevision,
    route,
    selectedNotePath,
    pendingDeletionPath,
    statusMessage,
    editorNote: currentNote ?? EMPTY_NOTE,
    isDirty,
    backlinks,
    handleSelectPath,
    handleOpenQuery,
    handleImportMarkdown,
    handleCancelImport,
    isImporting,
    canCancelImport,
    isResolvingConflict,
    canResolveConflict: !hasPendingSave && !isDirty && !isResolvingConflict,
    handleResolveSyncConflict,
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
  notifyNoteListRevision,
  showTemporaryStatus,
}: {
  noteService: NoteService;
  notifyNoteListRevision: () => void;
  showTemporaryStatus: (message: string) => void;
}): {
  handleImportMarkdown: () => Promise<void>;
  handleCancelImport: () => void;
  isImporting: boolean;
  canCancelImport: boolean;
  handleExportMarkdown: () => Promise<void>;
} {
  const importControllerRef = useRef<AbortController | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [canCancelImport, setCanCancelImport] = useState(false);
  const savingImportRef = useRef(false);

  const handleImportMarkdown = useCallback(async () => {
    if (importControllerRef.current) {
      return;
    }
    const controller = new AbortController();
    importControllerRef.current = controller;
    setIsImporting(true);
    setCanCancelImport(true);
    savingImportRef.current = false;
    try {
      const result = await noteService.importFromDirectory(controller.signal, () => {
        savingImportRef.current = true;
        setCanCancelImport(false);
      });
      if (result.status === "success") notifyNoteListRevision();
      showTemporaryStatus(importStatusMessage(result));
    } catch (error) {
      console.error("Failed to import Markdown notes", error);
      showTemporaryStatus("Failed to import Markdown notes");
    } finally {
      importControllerRef.current = null;
      setIsImporting(false);
      setCanCancelImport(false);
    }
  }, [noteService, notifyNoteListRevision, showTemporaryStatus]);

  const handleCancelImport = useCallback(() => {
    if (!savingImportRef.current) importControllerRef.current?.abort();
  }, []);

  const handleExportMarkdown = useCallback(async () => {
    try {
      const allNotes = await noteService.loadNotes();
      const result = await noteService.exportToDirectory(allNotes);
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
  }, [noteService, showTemporaryStatus]);

  return {
    handleImportMarkdown,
    handleCancelImport,
    isImporting,
    canCancelImport,
    handleExportMarkdown,
  };
}

function importStatusMessage(result: ImportMarkdownResult): string {
  if (result.status === "success") return `Imported ${result.importedCount} notes from folder`;
  const messages = {
    "no-markdown": "No Markdown files found in the selected folder",
    unsupported: "This browser does not support directory access",
    cancelled: "Markdown import cancelled",
    "limit-exceeded": "The selected folder exceeds the import limits",
    failed: "Failed to import Markdown notes",
  };
  return messages[result.status];
}
