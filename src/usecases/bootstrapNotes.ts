import type { Note } from "../domain/note";
import type { NoteStoragePort, AppRoute } from "./ports";

export type BootstrapNotesParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  noteStorage: NoteStoragePort;
  getCurrentRoute: () => AppRoute | null;
  signal?: AbortSignal;
};

export type BootstrapNotesResult = {
  notes: Note[];
  notesFromStorage: Note[];
  route: AppRoute;
  shouldNavigate: boolean;
  statusMessage?: string;
};

/**
 * Loads notes during the initial boot, determines routing, and creates notes when required.
 */
export async function bootstrapNotes({
  defaultPage,
  deriveTitle,
  sanitizeNoteForSave,
  noteStorage,
  getCurrentRoute,
  signal,
}: BootstrapNotesParams): Promise<BootstrapNotesResult> {
  try {
    const loaded = await noteStorage.loadNotes();
    if (signal?.aborted) {
      return createAbortedResult(defaultPage);
    }
    const routeFromHash = getCurrentRoute();
    if (routeFromHash?.kind === "query") {
      return {
        notes: loaded,
        notesFromStorage: loaded,
        route: routeFromHash,
        shouldNavigate: false,
      };
    }
    if (routeFromHash?.kind === "note") {
      const ensured = await ensureNoteExists({
        normalized: routeFromHash.path,
        notes: loaded,
        deriveTitle,
        sanitizeNoteForSave,
        noteStorage,
        signal,
      });
      return {
        notes: ensured.notes,
        notesFromStorage: loaded,
        route: routeFromHash,
        shouldNavigate: false,
        statusMessage: ensured.statusMessage,
      };
    }
    if (loaded[0]) {
      return {
        notes: loaded,
        notesFromStorage: loaded,
        route: { kind: "note", path: loaded[0].path },
        shouldNavigate: true,
      };
    }
    const created = await createDefaultNote({
      defaultPage,
      deriveTitle,
      sanitizeNoteForSave,
      noteStorage,
      signal,
    });
    return {
      notes: created.notes,
      notesFromStorage: loaded,
      route: { kind: "note", path: defaultPage },
      shouldNavigate: true,
      statusMessage: created.statusMessage,
    };
  } catch (error) {
    if (signal?.aborted) {
      return createAbortedResult(defaultPage);
    }
    console.error("Failed to bootstrap notes from storage", error);
    return {
      notes: [],
      notesFromStorage: [],
      route: { kind: "note", path: defaultPage },
      shouldNavigate: true,
      statusMessage: "Failed to load notes, starting from an empty state",
    };
  }
}

type EnsureNoteExistsParams = {
  normalized: string;
  notes: Note[];
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  noteStorage: NoteStoragePort;
  signal?: AbortSignal;
};

type EnsureNoteExistsResult = {
  notes: Note[];
  statusMessage?: string;
};

async function ensureNoteExists({
  normalized,
  notes,
  deriveTitle,
  sanitizeNoteForSave,
  noteStorage,
  signal,
}: EnsureNoteExistsParams): Promise<EnsureNoteExistsResult> {
  const exists = notes.some((note) => note.path === normalized);
  if (exists || signal?.aborted) {
    return { notes };
  }
  const newNote = sanitizeNoteForSave({
    path: normalized,
    title: deriveTitle(normalized),
    body: "",
  });
  const nextNotes = [...notes, newNote];
  let statusMessage: string | undefined;
  try {
    await noteStorage.saveNote(newNote);
  } catch (error) {
    console.error("Failed to create note via bootstrap hash handling", error);
    if (!signal?.aborted) {
      statusMessage = "Failed to create note from hash";
    }
  }
  return { notes: nextNotes, statusMessage };
}

type CreateDefaultNoteParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  noteStorage: NoteStoragePort;
  signal?: AbortSignal;
};

type CreateDefaultNoteResult = {
  notes: Note[];
  statusMessage?: string;
};

async function createDefaultNote({
  defaultPage,
  deriveTitle,
  sanitizeNoteForSave,
  noteStorage,
  signal,
}: CreateDefaultNoteParams): Promise<CreateDefaultNoteResult> {
  const fallbackNote = sanitizeNoteForSave({
    path: defaultPage,
    title: deriveTitle(defaultPage),
    body: "",
  });
  let statusMessage: string | undefined;
  try {
    await noteStorage.saveNote(fallbackNote);
  } catch (error) {
    if (!signal?.aborted) {
      console.error("Failed to create default note during bootstrap", error);
      statusMessage = "Failed to create default note";
    }
  }
  return { notes: [fallbackNote], statusMessage };
}

function createAbortedResult(defaultPage: string): BootstrapNotesResult {
  return {
    notes: [],
    notesFromStorage: [],
    route: { kind: "note", path: defaultPage },
    shouldNavigate: false,
  };
}
