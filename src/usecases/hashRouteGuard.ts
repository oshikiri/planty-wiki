import type { Dispatch, MutableRef, StateUpdater } from "preact/hooks";

import type { Route } from "../navigation/route";
import type { Router } from "../navigation/router";
import type { Note } from "../types/note";

type HashRouteGuardParams = {
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  setRoute: Dispatch<StateUpdater<Route>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  saveNote: (note: Note) => Promise<void>;
  notesRef: MutableRef<Note[]>;
  router: Router;
  signal?: AbortSignal;
};

/**
 * Handles hashchange events by checking the route and creating or routing to the note when necessary.
 *
 * @param params Dependencies such as note references and save functions
 * @returns Promise that resolves when processing completes
 */
export async function handleHashRouteChange({
  deriveTitle,
  sanitizeNoteForSave,
  setNotes,
  setRoute,
  setStatusMessage,
  saveNote,
  notesRef,
  router,
  signal,
}: HashRouteGuardParams): Promise<void> {
  const routeFromHash = router.getCurrentRoute();
  const latestNotes = notesRef.current;
  if (!routeFromHash || signal?.aborted) {
    return;
  }
  if (routeFromHash.type === "query") {
    setRoute(routeFromHash);
    return;
  }
  if (!latestNotes.length) return;
  const next = routeFromHash.path;

  const exists = latestNotes.some((note) => note.path === next);
  if (!exists) {
    const title = deriveTitle(next);
    const newNote = sanitizeNoteForSave({ path: next, title, body: "" });
    setNotes((prev) => [...prev, newNote]);
    try {
      await saveNote(newNote);
    } catch (error) {
      if (!signal?.aborted) {
        console.error("Failed to create note via hashchange", error);
        setStatusMessage("Failed to create note from hash");
      }
    }
  }
  if (!signal?.aborted) {
    setRoute(routeFromHash);
  }
}
