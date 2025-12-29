import type { Note } from "../domain/note";
import type { AppRoute } from "./ports";

export type HashRouteGuardParams = {
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  notes: Note[];
  saveNote: (note: Note) => Promise<void>;
  getCurrentRoute: () => AppRoute | null;
  signal?: AbortSignal;
};

export type HashRouteGuardResult = {
  notes?: Note[];
  route?: AppRoute;
  statusMessage?: string;
};

/**
 * Handles hashchange events by checking the route and creating or routing to the note when necessary.
 */
export async function handleHashRouteChange({
  deriveTitle,
  sanitizeNoteForSave,
  notes,
  saveNote,
  getCurrentRoute,
  signal,
}: HashRouteGuardParams): Promise<HashRouteGuardResult | null> {
  const routeFromHash = getCurrentRoute();
  if (!routeFromHash || signal?.aborted) {
    return null;
  }
  if (routeFromHash.kind === "query") {
    return { route: routeFromHash };
  }
  const exists = notes.some((note) => note.path === routeFromHash.path);
  if (exists) {
    return { route: routeFromHash };
  }
  const title = deriveTitle(routeFromHash.path);
  const newNote = sanitizeNoteForSave({ path: routeFromHash.path, title, body: "" });
  let statusMessage: string | undefined;
  try {
    await saveNote(newNote);
  } catch (error) {
    if (!signal?.aborted) {
      console.error("Failed to create note via hashchange", error);
      statusMessage = "Failed to create note from hash";
    }
  }
  return {
    notes: [...notes, newNote],
    route: routeFromHash,
    statusMessage,
  };
}
