import type { Note } from "../domain/note";
import type { NoteStoragePort, AppRoute } from "./ports";
import type { StateSetter } from "./state";

type BootstrapNotesParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: StateSetter<Note[]>;
  setNotesFromStorage: (notes: Note[]) => void;
  applyRoute: (route: AppRoute) => void;
  navigateRoute: (route: AppRoute) => void;
  setStatusMessage: (message: string) => void;
  noteStorage: NoteStoragePort;
  getCurrentRoute: () => AppRoute | null;
  signal?: AbortSignal;
};

/**
 * Loads notes during the initial boot, determines routing, and creates notes when required.
 *
 * @param params Dependencies needed for storage access and UI updates
 * @returns Promise that resolves once initialization is done
 */
export async function bootstrapNotes({
  defaultPage,
  deriveTitle,
  sanitizeNoteForSave,
  setNotes,
  setNotesFromStorage,
  applyRoute,
  navigateRoute,
  setStatusMessage,
  noteStorage,
  getCurrentRoute,
  signal,
}: BootstrapNotesParams): Promise<void> {
  try {
    const loaded = await noteStorage.loadNotes();
    if (signal?.aborted) {
      return;
    }
    setNotesFromStorage(loaded);
    const routeFromHash = getCurrentRoute();
    if (routeFromHash?.kind === "query") {
      applyRoute(routeFromHash);
      return;
    }
    if (routeFromHash?.kind === "note") {
      await ensureNoteExists({
        normalized: routeFromHash.path,
        loaded,
        deriveTitle,
        sanitizeNoteForSave,
        setNotes,
        noteStorage,
        setStatusMessage,
        signal,
      });
      if (signal?.aborted) {
        return;
      }
      applyRoute(routeFromHash);
      return;
    }
    if (loaded[0]) {
      navigateRoute({ kind: "note", path: loaded[0].path });
      return;
    }
    await createDefaultNote({
      defaultPage,
      deriveTitle,
      sanitizeNoteForSave,
      setNotes,
      noteStorage,
      setStatusMessage,
      signal,
    });
    if (signal?.aborted) {
      return;
    }
    navigateRoute({ kind: "note", path: defaultPage });
  } catch (error) {
    if (signal?.aborted) {
      return;
    }
    console.error("Failed to bootstrap notes from storage", error);
    setStatusMessage("Failed to load notes, starting from an empty state");
    setNotesFromStorage([]);
    navigateRoute({ kind: "note", path: defaultPage });
  }
}

type EnsureNoteExistsParams = {
  normalized: string;
  loaded: Note[];
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: StateSetter<Note[]>;
  noteStorage: NoteStoragePort;
  setStatusMessage: (message: string) => void;
  signal?: AbortSignal;
};

async function ensureNoteExists({
  normalized,
  loaded,
  deriveTitle,
  sanitizeNoteForSave,
  setNotes,
  noteStorage,
  setStatusMessage,
  signal,
}: EnsureNoteExistsParams) {
  const exists = loaded.some((note) => note.path === normalized);
  if (exists || signal?.aborted) {
    return;
  }
  const newNote = sanitizeNoteForSave({
    path: normalized,
    title: deriveTitle(normalized),
    body: "",
  });
  setNotes((prev) => [...prev, newNote]);
  try {
    await noteStorage.saveNote(newNote);
  } catch (error) {
    console.error("Failed to create note via bootstrap hash handling", error);
    if (!signal?.aborted) {
      setStatusMessage("Failed to create note from hash");
    }
  }
}

type CreateDefaultNoteParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: StateSetter<Note[]>;
  noteStorage: NoteStoragePort;
  setStatusMessage: (message: string) => void;
  signal?: AbortSignal;
};

async function createDefaultNote({
  defaultPage,
  deriveTitle,
  sanitizeNoteForSave,
  setNotes,
  noteStorage,
  setStatusMessage,
  signal,
}: CreateDefaultNoteParams) {
  const fallbackNote = sanitizeNoteForSave({
    path: defaultPage,
    title: deriveTitle(defaultPage),
    body: "",
  });
  setNotes([fallbackNote]);
  try {
    await noteStorage.saveNote(fallbackNote);
  } catch (error) {
    if (!signal?.aborted) {
      console.error("Failed to create default note during bootstrap", error);
      setStatusMessage("Failed to create default note");
    }
  }
}
