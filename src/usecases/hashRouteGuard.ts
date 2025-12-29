import type { Note } from "../domain/note";
import type { AppRoute } from "./ports";
import type { StateSetter } from "./state";

type HashRouteGuardParams = {
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: StateSetter<Note[]>;
  applyRoute: (route: AppRoute) => void;
  setStatusMessage: (message: string) => void;
  saveNote: (note: Note) => Promise<void>;
  getNotesSnapshot: () => Note[];
  getCurrentRoute: () => AppRoute | null;
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
  applyRoute,
  setStatusMessage,
  saveNote,
  getNotesSnapshot,
  getCurrentRoute,
  signal,
}: HashRouteGuardParams): Promise<void> {
  const routeFromHash = getCurrentRoute();
  const latestNotes = getNotesSnapshot();
  if (!routeFromHash || signal?.aborted) {
    return;
  }
  if (routeFromHash.kind === "query") {
    applyRoute(routeFromHash);
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
    applyRoute(routeFromHash);
  }
}
