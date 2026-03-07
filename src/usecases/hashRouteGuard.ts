import type { Note } from "../domain/note";
import type { AppRoute, NoteStoragePort } from "./ports";

type HashRouteGuardParams = {
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  resolveBundledDocBody?: (path: string) => string | null;
  noteStorage: Pick<NoteStoragePort, "loadNote" | "saveNote">;
  getCurrentRoute: () => AppRoute | null;
  signal?: AbortSignal;
};

type HashRouteGuardResult = {
  route?: AppRoute;
  statusMessage?: string;
  storageUpdated?: boolean;
};

/**
 * Handles hashchange events by checking the route and creating or routing to the note when necessary.
 *
 * @param params Dependencies required to resolve and persist a hash-based route
 * @returns Route update result, or null when the current hash cannot be handled
 */
export async function handleHashRouteChange({
  deriveTitle,
  sanitizeNoteForSave,
  resolveBundledDocBody,
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
    body: resolveBundledDocBody?.(routeFromHash.path) ?? "",
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
