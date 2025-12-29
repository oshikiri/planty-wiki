import { useCallback, type Dispatch, type StateUpdater } from "preact/hooks";

import type { Route } from "../navigation/route";
import type { Note } from "../types/note";
import type { NoteService } from "../services/note-service";
import type { Router } from "../navigation/router";
import { selectOrCreateNote } from "../usecases/selectOrCreateNote";

export type UseSelectPathHandlerParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  notes: Note[];
  sanitizeNoteForSave: (note: Note) => Note;
  setDraftBody: Dispatch<StateUpdater<string>>;
  setNotes: Dispatch<StateUpdater<Note[]>>;
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
  notes,
  sanitizeNoteForSave,
  setDraftBody,
  setNotes,
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
        notes,
        sanitizeNoteForSave,
        noteStorage: {
          saveNote: (note) => noteService.saveNote(note),
        },
      })
        .then((result) => {
          if (!result) {
            return;
          }
          setNotes(result.notes);
          setDraftBody(result.draftBody);
          const nextRoute: Route = { type: "note", path: result.routePath };
          setRoute(nextRoute);
          router.navigate(nextRoute);
          if (result.statusMessage) {
            setStatusMessage(result.statusMessage);
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
      notes,
      sanitizeNoteForSave,
      setDraftBody,
      setNotes,
      setStatusMessage,
      noteService,
      router,
      setRoute,
    ],
  );
}
