import { useCallback, type Dispatch, type StateUpdater } from "preact/hooks";

import type { Route } from "../navigation/route";
import type { Note } from "../types/note";
import type { NoteService } from "../services/note-service";
import type { Router } from "../navigation/router";
import { selectOrCreateNote } from "../usecases/selectOrCreateNote";

export type UseSelectPathHandlerParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setDraftBody: Dispatch<StateUpdater<string>>;
  setCurrentNote: Dispatch<StateUpdater<Note | null>>;
  incrementNoteRevision: () => void;
  incrementNoteListRevision: () => void;
  setRoute: Dispatch<StateUpdater<Route>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  noteService: NoteService;
  router: Router;
};

/**
 * Provides a callback that selects a note (and creates it if needed) to keep the App handler lean.
 *
 * @param params Values required for selection such as defaultPage and storage dependencies
 * @returns Callback that accepts a path and performs selection/creation
 */
export function useSelectPathHandler({
  defaultPage,
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
}: UseSelectPathHandlerParams) {
  return useCallback(
    (path: string) => {
      selectOrCreateNote({
        path,
        defaultPage,
        deriveTitle,
        sanitizeNoteForSave,
        noteStorage: {
          saveNote: (note) => noteService.saveNote(note),
          loadNote: (targetPath) => noteService.loadNote(targetPath),
        },
      })
        .then((result) => {
          if (!result) {
            return;
          }
          setCurrentNote(result.note);
          incrementNoteRevision();
          setDraftBody(result.note.body);
          const nextRoute: Route = { type: "note", path: result.routePath };
          setRoute(nextRoute);
          router.navigate(nextRoute);
          if (result.statusMessage) {
            setStatusMessage(result.statusMessage);
          }
          if (result.created) {
            incrementNoteListRevision();
          }
        })
        .catch((error) => {
          console.error("Unhandled error during handleSelectPath", error);
          setStatusMessage("Failed to select note");
        });
    },
    [
      defaultPage,
      deriveTitle,
      sanitizeNoteForSave,
      setDraftBody,
      setCurrentNote,
      incrementNoteRevision,
      incrementNoteListRevision,
      setStatusMessage,
      noteService,
      router,
      setRoute,
    ],
  );
}
