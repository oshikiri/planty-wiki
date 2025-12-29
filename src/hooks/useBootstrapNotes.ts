import { useEffect, type Dispatch, type StateUpdater } from "preact/hooks";

import type { Note } from "../types/note";
import type { NoteService } from "../services/note-service";
import type { Router } from "../navigation/router";
import type { Route } from "../navigation/route";
import { bootstrapNotes } from "../usecases/bootstrapNotes";

type SetNotesFromStorage = (next: Note[]) => void;

export type UseBootstrapNotesParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  setNotesFromStorage: SetNotesFromStorage;
  setRoute: Dispatch<StateUpdater<Route>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  noteService: NoteService;
  router: Router;
};

/**
 * useBootstrapNotes handles the initial note loading and hash-specified page creation to keep App-side effects simple.
 *
 * @param params Object containing dependencies required for bootstrapping (defaultPage, storage APIs, etc.)
 * @returns void
 */
export function useBootstrapNotes(params: UseBootstrapNotesParams) {
  const {
    defaultPage,
    deriveTitle,
    sanitizeNoteForSave,
    setNotes,
    setNotesFromStorage,
    setRoute,
    setStatusMessage,
    noteService,
    router,
  } = params;
  useEffect(() => {
    const abortController = new AbortController();
    bootstrapNotes({
      defaultPage,
      deriveTitle,
      sanitizeNoteForSave,
      setNotes,
      setNotesFromStorage,
      setRoute,
      setStatusMessage,
      noteService,
      router,
      signal: abortController.signal,
    }).catch((error) => {
      if (abortController.signal.aborted) {
        return;
      }
      console.error("Failed to bootstrap notes", error);
      setStatusMessage("Failed to initialize notes");
    });
    return () => {
      abortController.abort();
    };
  }, [
    defaultPage,
    deriveTitle,
    sanitizeNoteForSave,
    setNotes,
    setNotesFromStorage,
    setRoute,
    setStatusMessage,
    noteService,
    router,
  ]);
}
