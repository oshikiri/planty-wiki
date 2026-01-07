import type { Note } from "../domain/note";
import type { AppRoute, NoteStoragePort } from "./ports";

export type HashRouteGuardParams = {
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  noteStorage: Pick<NoteStoragePort, "loadNote" | "saveNote">;
  getCurrentRoute: () => AppRoute | null;
  signal?: AbortSignal;
};

export type HashRouteGuardResult = {
  route?: AppRoute;
  statusMessage?: string;
  storageUpdated?: boolean;
};

/**
 * Handles hashchange events by checking the route and creating or routing to the note when necessary.
 */
export async function handleHashRouteChange({
  deriveTitle,
  sanitizeNoteForSave,
  noteStorage,
  getCurrentRoute,
  signal,
}: HashRouteGuardParams): Promise<HashRouteGuardResult | null> {
  const routeFromHash = getCurrentRoute();
  if (!routeFromHash || signal?.aborted) {
    return null;
  }
  if (routeFromHash.kind === "query") {
    return { route: routeFromHash, storageUpdated: false };
  }
  const exists = await noteStorage.loadNote(routeFromHash.path);
  if (exists) {
    return { route: routeFromHash, storageUpdated: false };
  }
  const title = deriveTitle(routeFromHash.path);
  const now = new Date().toISOString();
  const newNote = sanitizeNoteForSave({
    path: routeFromHash.path,
    title,
    body: "",
    updatedAt: now,
  });
  let statusMessage: string | undefined;
  let storageUpdated = false;
  try {
    await noteStorage.saveNote(newNote);
    storageUpdated = true;
  } catch (error) {
    if (!signal?.aborted) {
      console.error("Failed to create note via hashchange", error);
      statusMessage = "Failed to create note from hash";
    }
  }
  return {
    route: routeFromHash,
    statusMessage,
    storageUpdated,
  };
}
