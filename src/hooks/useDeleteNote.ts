import { useCallback, type Dispatch, type StateUpdater } from "preact/hooks";

import type { Route } from "../navigation/route";
import type { Router } from "../navigation/router";
import type { Note, PendingSave } from "../types/note";
import type { NoteService } from "../services/note-service";
import { deletePendingNote } from "../usecases/deleteNote";

export type UseDeleteNoteParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  notes: Note[];
  pendingDeletionPath: string | null;
  pendingSave: PendingSave | null;
  sanitizeNoteForSave: (note: Note) => Note;
  selectedNotePath: string | null;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  setPendingDeletionPath: Dispatch<StateUpdater<string | null>>;
  setPendingSave: Dispatch<StateUpdater<PendingSave | null>>;
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
  notes,
  pendingDeletionPath,
  pendingSave,
  sanitizeNoteForSave,
  selectedNotePath,
  setNotes,
  setPendingDeletionPath,
  setPendingSave,
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
        notes,
        pendingDeletionPath,
        pendingSave,
        sanitizeNoteForSave,
        selectedNotePath,
        noteStorage: {
          deleteNote: (path) => noteService.deleteNote(path),
          saveNote: (note) => noteService.saveNote(note),
          loadNotes: () => noteService.loadNotes(),
        },
      });
      setNotes(result.notes);
      setPendingDeletionPath(result.pendingDeletionPath);
      setPendingSave(result.pendingSave);
      if (result.routePath) {
        const nextRoute: Route = { type: "note", path: result.routePath };
        setRoute(nextRoute);
        router.navigate(nextRoute);
      }
      if (result.statusMessage) {
        setStatusMessage(result.statusMessage);
      }
    } catch (error) {
      console.error("Failed to delete note", error);
      setStatusMessage("Failed to delete note");
    }
  }, [
    defaultPage,
    deriveTitle,
    notes,
    noteService,
    pendingDeletionPath,
    pendingSave,
    router,
    sanitizeNoteForSave,
    selectedNotePath,
    setNotes,
    setPendingDeletionPath,
    setPendingSave,
    setRoute,
    setStatusMessage,
  ]);
}
