import type { Note, NoteSummary } from "../domain/note";
import type { NoteStoragePort, AppRoute } from "./ports";

export type BootstrapNotesParams = {
  defaultPage: string;
  defaultNoteBody: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  resolveBundledDocBody?: (path: string) => string | null;
  noteStorage: NoteStoragePort;
  getCurrentRoute: () => AppRoute | null;
  signal?: AbortSignal;
};

export type BootstrapNotesResult = {
  route: AppRoute;
  shouldNavigate: boolean;
  initialNote: Note | null;
  statusMessage?: string;
  storageUpdated: boolean;
};

/**
 * Loads note summaries during the initial boot, determines routing, and fetches the first note body when required.
 *
 * @param params Dependencies required to initialize notes and route state
 * @returns Initial route and note data used by the application boot flow
 */
export async function bootstrapNotes({
  defaultPage,
  defaultNoteBody,
  deriveTitle,
  sanitizeNoteForSave,
  resolveBundledDocBody,
  noteStorage,
  getCurrentRoute,
  signal,
}: BootstrapNotesParams): Promise<BootstrapNotesResult> {
  try {
    const summaries = await noteStorage.loadNoteSummaries();
    let storageUpdated = false;
    if (signal?.aborted) {
      return createAbortedResult(defaultPage);
    }
    const routeFromHash = getCurrentRoute();
    if (routeFromHash?.kind === "query") {
      return {
        route: routeFromHash,
        shouldNavigate: false,
        initialNote: null,
        storageUpdated,
      };
    }
    if (routeFromHash?.kind === "note") {
      const ensured = await ensureNoteExists({
        normalized: routeFromHash.path,
        summaries,
        deriveTitle,
        sanitizeNoteForSave,
        resolveBundledDocBody,
        noteStorage,
        signal,
      });
      storageUpdated = storageUpdated || ensured.storageUpdated;
      const resolvedNote = applyBundledDocBody(
        await noteStorage.loadNote(routeFromHash.path),
        resolveBundledDocBody,
      );
      return {
        route: routeFromHash,
        shouldNavigate: false,
        initialNote: resolvedNote,
        statusMessage: ensured.statusMessage,
        storageUpdated,
      };
    }
    if (summaries[0]) {
      const route: AppRoute = { kind: "note", path: summaries[0].path };
      const initialNote = applyBundledDocBody(
        await noteStorage.loadNote(route.path),
        resolveBundledDocBody,
      );
      return {
        route,
        shouldNavigate: true,
        initialNote,
        storageUpdated: false,
      };
    }
    const created = await createDefaultNote({
      defaultPage,
      defaultNoteBody,
      deriveTitle,
      sanitizeNoteForSave,
      resolveBundledDocBody,
      noteStorage,
      signal,
    });
    storageUpdated = storageUpdated || created.storageUpdated;
    return {
      route: { kind: "note", path: defaultPage },
      shouldNavigate: true,
      initialNote: created.note,
      statusMessage: created.statusMessage,
      storageUpdated,
    };
  } catch (error) {
    if (signal?.aborted) {
      return createAbortedResult(defaultPage);
    }
    console.error("Failed to bootstrap notes from storage", error);
    return {
      route: { kind: "note", path: defaultPage },
      shouldNavigate: true,
      initialNote: null,
      statusMessage: "Failed to load notes, starting from an empty state",
      storageUpdated: false,
    };
  }
}

type EnsureNoteExistsParams = {
  normalized: string;
  summaries: NoteSummary[];
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  resolveBundledDocBody?: (path: string) => string | null;
  noteStorage: NoteStoragePort;
  signal?: AbortSignal;
};

type EnsureNoteExistsResult = {
  storageUpdated: boolean;
  statusMessage?: string;
};

async function ensureNoteExists({
  normalized,
  summaries,
  deriveTitle,
  sanitizeNoteForSave,
  resolveBundledDocBody,
  noteStorage,
  signal,
}: EnsureNoteExistsParams): Promise<EnsureNoteExistsResult> {
  const exists = summaries.some((summary) => summary.path === normalized);
  if (exists || signal?.aborted) {
    return { storageUpdated: false };
  }
  const now = new Date().toISOString();
  const newNote = sanitizeNoteForSave({
    path: normalized,
    title: deriveTitle(normalized),
    body: resolveBundledDocBody?.(normalized) ?? "",
    updatedAt: now,
  });
  let statusMessage: string | undefined;
  let storageUpdated = false;
  try {
    await noteStorage.saveNote(newNote);
    storageUpdated = true;
  } catch (error) {
    console.error("Failed to create note via bootstrap hash handling", error);
    if (!signal?.aborted) {
      statusMessage = "Failed to create note from hash";
    }
  }
  return { storageUpdated, statusMessage };
}

type CreateDefaultNoteParams = {
  defaultPage: string;
  defaultNoteBody: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  resolveBundledDocBody?: (path: string) => string | null;
  noteStorage: NoteStoragePort;
  signal?: AbortSignal;
};

type CreateDefaultNoteResult = {
  note: Note | null;
  statusMessage?: string;
  storageUpdated: boolean;
};

async function createDefaultNote({
  defaultPage,
  defaultNoteBody,
  deriveTitle,
  sanitizeNoteForSave,
  resolveBundledDocBody,
  noteStorage,
  signal,
}: CreateDefaultNoteParams): Promise<CreateDefaultNoteResult> {
  const now = new Date().toISOString();
  const fallbackNote = sanitizeNoteForSave({
    path: defaultPage,
    title: deriveTitle(defaultPage),
    body: resolveBundledDocBody?.(defaultPage) ?? defaultNoteBody,
    updatedAt: now,
  });
  let statusMessage: string | undefined;
  let storageUpdated = false;
  try {
    await noteStorage.saveNote(fallbackNote);
    storageUpdated = true;
  } catch (error) {
    if (!signal?.aborted) {
      console.error("Failed to create default note during bootstrap", error);
      statusMessage = "Failed to create default note";
    }
  }
  return { note: fallbackNote, statusMessage, storageUpdated };
}

function createAbortedResult(defaultPage: string): BootstrapNotesResult {
  return {
    route: { kind: "note", path: defaultPage },
    shouldNavigate: false,
    initialNote: null,
    storageUpdated: false,
  };
}

function applyBundledDocBody(
  note: Note | null,
  resolveBundledDocBody?: (path: string) => string | null,
): Note | null {
  if (!note || !resolveBundledDocBody) {
    return note;
  }
  const bundledBody = resolveBundledDocBody(note.path);
  if (bundledBody === null) {
    return note;
  }
  if (note.body === bundledBody) {
    return note;
  }
  return { ...note, body: bundledBody };
}
