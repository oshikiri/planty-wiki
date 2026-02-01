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
import type { Router } from "../navigation/router";
import { buildNote, deriveTitleFromPath } from "../domain/note";
import { DEFAULT_DOC_SOURCES, DEFAULT_INDEX_MARKDOWN } from "../defaults/initial-docs";

import { useBacklinks, type Backlink } from "./useBacklinks";
import { useBootstrapNotes } from "./useBootstrapNotes";
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
          setCurrentNote(note);
          incrementNoteRevision();
          return;
        }
        const fallback = sanitizeNoteForSave({
          path: route.path,
          title: deriveTitle(route.path),
          body: "",
        });
        setCurrentNote(fallback);
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
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  useBootstrapNotes({
    defaultPage: DEFAULT_PAGE_PATH,
    defaultNoteBody: DEFAULT_INDEX_MARKDOWN,
    defaultDocSources: DEFAULT_DOC_SOURCES,
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
    setCurrentNote,
    saveNote: noteService.saveNote,
    setStatusMessage,
    notifyNotePersisted: incrementNoteListRevision,
  });

  useHashRouteGuard({
    deriveTitle,
    sanitizeNoteForSave,
    setRoute,
    setStatusMessage,
    noteService,
    router,
    notifyNoteListRevision: incrementNoteListRevision,
  });

  const { handleImportMarkdown, handleExportMarkdown } = useMarkdownTransfer({
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
  handleExportMarkdown: () => Promise<void>;
} {
  const handleImportMarkdown = useCallback(async () => {
    try {
      const result = await noteService.importFromDirectory();
      if (result.status === "success") {
        notifyNoteListRevision();
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
  }, [noteService, notifyNoteListRevision, showTemporaryStatus]);

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

  return { handleImportMarkdown, handleExportMarkdown };
}
