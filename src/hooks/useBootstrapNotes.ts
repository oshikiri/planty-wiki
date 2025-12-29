import { useEffect, type Dispatch, type StateUpdater } from "preact/hooks";

import type { Note } from "../types/note";
import type { NoteService } from "../services/note-service";
import type { Router } from "../navigation/router";
import type { Route } from "../navigation/route";
import { bootstrapNotes } from "../usecases/bootstrapNotes";
import type { AppRoute, NoteStoragePort } from "../usecases/ports";

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
      applyRoute: (route) => setRoute(mapAppRouteToNavigation(route)),
      navigateRoute: (route) => {
        const nextRoute = mapAppRouteToNavigation(route);
        setRoute(nextRoute);
        router.navigate(nextRoute);
      },
      setStatusMessage,
      noteStorage: createNoteStoragePort(noteService),
      getCurrentRoute: () => mapNavigationRouteToApp(router.getCurrentRoute()),
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

function mapNavigationRouteToApp(route: Route | null): AppRoute | null {
  if (!route) {
    return null;
  }
  if (route.type === "query") {
    return { kind: "query" };
  }
  return { kind: "note", path: route.path };
}

function mapAppRouteToNavigation(route: AppRoute): Route {
  if (route.kind === "query") {
    return { type: "query" };
  }
  return { type: "note", path: route.path };
}

function createNoteStoragePort(noteService: NoteService): NoteStoragePort {
  return {
    loadNotes: () => noteService.loadNotes(),
    saveNote: (note: Note) => noteService.saveNote(note),
    deleteNote: (path: Note["path"]) => noteService.deleteNote(path),
  };
}
