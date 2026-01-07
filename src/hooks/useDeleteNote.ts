import { useCallback, type Dispatch, type StateUpdater } from "preact/hooks";

import type { Route } from "../navigation/route";
import type { Router } from "../navigation/router";
import type { Note, PendingSave } from "../types/note";
import type { NoteService } from "../services/note-service";
import { deletePendingNote } from "../usecases/deleteNote";

export type UseDeleteNoteParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  pendingDeletionPath: string | null;
  pendingSave: PendingSave | null;
  sanitizeNoteForSave: (note: Note) => Note;
  selectedNotePath: string | null;
  setPendingDeletionPath: Dispatch<StateUpdater<string | null>>;
  setPendingSave: Dispatch<StateUpdater<PendingSave | null>>;
  setCurrentNote: Dispatch<StateUpdater<Note | null>>;
  incrementNoteRevision: () => void;
  incrementNoteListRevision: () => void;
  setRoute: Dispatch<StateUpdater<Route>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  noteService: NoteService;
  router: Router;
};

/**
 * Provides a callback that safely deletes the pending note and creates the default note if needed.
 *
 * @param params Note arrays and state setters required for deletion
 * @returns Async handler invoked when the deletion is confirmed
 */
export function useDeleteNote({
  defaultPage,
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
}: UseDeleteNoteParams) {
  return useCallback(async () => {
    try {
      const result = await deletePendingNote({
        defaultPage,
        deriveTitle,
        pendingDeletionPath,
        pendingSave,
        sanitizeNoteForSave,
        selectedNotePath,
        noteStorage: {
          saveNote: (note) => noteService.saveNote(note),
          deleteNote: (path) => noteService.deleteNote(path),
          loadNoteSummaries: () => noteService.loadNoteSummaries(),
          loadNote: (path) => noteService.loadNote(path),
          loadNotes: () => noteService.loadNotes(),
        },
      });
      setPendingDeletionPath(result.pendingDeletionPath);
      setPendingSave(result.pendingSave);
      if (result.routePath) {
        const nextRoute: Route = { type: "note", path: result.routePath };
        setRoute(nextRoute);
        router.navigate(nextRoute);
      }
      if (result.nextNote !== undefined) {
        setCurrentNote(result.nextNote ?? null);
        incrementNoteRevision();
      }
      if (result.statusMessage) {
        setStatusMessage(result.statusMessage);
      }
      if (result.deleted) {
        incrementNoteListRevision();
      }
    } catch (error) {
      console.error("Failed to delete note", error);
      setStatusMessage("Failed to delete note");
    }
  }, [
    defaultPage,
    deriveTitle,
    noteService,
    pendingDeletionPath,
    pendingSave,
    router,
    sanitizeNoteForSave,
    selectedNotePath,
    setPendingDeletionPath,
    setPendingSave,
    setCurrentNote,
    incrementNoteRevision,
    incrementNoteListRevision,
    setRoute,
    setStatusMessage,
  ]);
}
