import { useEffect, type Dispatch, type MutableRef, type StateUpdater } from "preact/hooks";

import type { Note } from "../types/note";
import type { Route } from "../navigation/route";
import type { Router } from "../navigation/router";
import { handleHashRouteChange } from "../usecases/hashRouteGuard";
import type { AppRoute } from "../usecases/ports";

type UseHashRouteGuardParams = {
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  setRoute: Dispatch<StateUpdater<Route>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  saveNote: (note: Note) => Promise<void>;
  notesRef: MutableRef<Note[]>;
  router: Router;
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
  setNotes,
  setRoute,
  setStatusMessage,
  saveNote,
  notesRef,
  router,
}: UseHashRouteGuardParams) {
  useEffect(() => {
    const abortController = new AbortController();

    const runHandler = () =>
      handleHashRouteChange({
        deriveTitle,
        sanitizeNoteForSave,
        notes: notesRef.current,
        saveNote,
        getCurrentRoute: () => mapNavigationRouteToApp(router.getCurrentRoute()),
        signal: abortController.signal,
      })
        .then((result) => {
          if (!result || abortController.signal.aborted) {
            return;
          }
          if (result.notes) {
            setNotes(result.notes);
          }
          if (result.route) {
            setRoute(mapAppRouteToNavigation(result.route));
          }
          if (result.statusMessage) {
            setStatusMessage(result.statusMessage);
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
    notesRef,
    router,
    sanitizeNoteForSave,
    setNotes,
    setRoute,
    setStatusMessage,
    saveNote,
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
