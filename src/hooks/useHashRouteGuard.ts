import { useEffect, type Dispatch, type StateUpdater } from "preact/hooks";

import type { Note } from "../types/note";
import type { Route } from "../navigation/route";
import type { Router } from "../navigation/router";
import { handleHashRouteChange } from "../usecases/hashRouteGuard";
import type { AppRoute } from "../usecases/ports";
import type { NoteService } from "../services/note-service";

type UseHashRouteGuardParams = {
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setRoute: Dispatch<StateUpdater<Route>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  noteService: NoteService;
  router: Router;
  notifyNoteListRevision: () => void;
};

/**
 * Observes hashchange events, creating the requested note when missing before routing to it.
 *
 * @param params Dependencies required for hash monitoring such as note refs and save functions
 * @returns void
 */
export function useHashRouteGuard({
  deriveTitle,
  sanitizeNoteForSave,
  setRoute,
  setStatusMessage,
  noteService,
  router,
  notifyNoteListRevision,
}: UseHashRouteGuardParams) {
  useEffect(() => {
    const abortController = new AbortController();

    const runHandler = () =>
      handleHashRouteChange({
        deriveTitle,
        sanitizeNoteForSave,
        noteStorage: {
          loadNote: (path) => noteService.loadNote(path),
          saveNote: (note) => noteService.saveNote(note),
        },
        getCurrentRoute: () => mapNavigationRouteToApp(router.getCurrentRoute()),
        signal: abortController.signal,
      })
        .then((result) => {
          if (!result || abortController.signal.aborted) {
            return;
          }
          if (result.route) {
            setRoute(mapAppRouteToNavigation(result.route));
          }
          if (result.statusMessage) {
            setStatusMessage(result.statusMessage);
          }
          if (result.storageUpdated) {
            notifyNoteListRevision();
          }
        })
        .catch((error) => {
          if (abortController.signal.aborted) {
            return;
          }
          console.error("Failed to handle hash route change", error);
          setStatusMessage("Failed to handle hash route");
        });

    runHandler();
    const unsubscribe = router.subscribe(runHandler);

    return () => {
      abortController.abort();
      unsubscribe();
    };
  }, [
    deriveTitle,
    router,
    sanitizeNoteForSave,
    setRoute,
    setStatusMessage,
    noteService,
    notifyNoteListRevision,
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
