import type { Note, NoteSummary } from "../domain/note";
import { normalizePath } from "../domain/path";
import type { NoteStoragePort, AppRoute } from "./ports";

type DefaultDocSource = {
  sourcePath: string;
  body: string;
};

export type BootstrapNotesParams = {
  defaultPage: string;
  defaultNoteBody: string;
  defaultDocSources: DefaultDocSource[];
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
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
 */
export async function bootstrapNotes({
  defaultPage,
  defaultNoteBody,
  defaultDocSources,
  deriveTitle,
  sanitizeNoteForSave,
  noteStorage,
  getCurrentRoute,
  signal,
}: BootstrapNotesParams): Promise<BootstrapNotesResult> {
  try {
    let summaries = await noteStorage.loadNoteSummaries();
    let isStorageEmpty = summaries.length === 0;
    let storageUpdated = false;
    if (isStorageEmpty) {
      const seeded = await seedDefaultNotes({
        defaultPage,
        defaultNoteBody,
        defaultDocSources,
        deriveTitle,
        sanitizeNoteForSave,
        noteStorage,
      });
      storageUpdated = storageUpdated || seeded.storageUpdated;
      if (storageUpdated) {
        summaries = await noteStorage.loadNoteSummaries();
        isStorageEmpty = summaries.length === 0;
      }
    }
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
        isStorageEmpty,
        defaultPage,
        defaultNoteBody,
        summaries,
        deriveTitle,
        sanitizeNoteForSave,
        noteStorage,
        signal,
      });
      storageUpdated = storageUpdated || ensured.storageUpdated;
      const resolvedNote = await noteStorage.loadNote(routeFromHash.path);
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
      const initialNote = await noteStorage.loadNote(route.path);
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
  isStorageEmpty: boolean;
  defaultPage: string;
  defaultNoteBody: string;
  summaries: NoteSummary[];
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  noteStorage: NoteStoragePort;
  signal?: AbortSignal;
};

type EnsureNoteExistsResult = {
  storageUpdated: boolean;
  statusMessage?: string;
};

async function ensureNoteExists({
  normalized,
  isStorageEmpty,
  defaultPage,
  defaultNoteBody,
  summaries,
  deriveTitle,
  sanitizeNoteForSave,
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
    body: isStorageEmpty && normalized === defaultPage ? defaultNoteBody : "",
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
  noteStorage,
  signal,
}: CreateDefaultNoteParams): Promise<CreateDefaultNoteResult> {
  const now = new Date().toISOString();
  const fallbackNote = sanitizeNoteForSave({
    path: defaultPage,
    title: deriveTitle(defaultPage),
    body: defaultNoteBody,
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

type NoteSeed = {
  path: string;
  body: string;
};

type SeedDefaultNotesParams = {
  defaultPage: string;
  defaultNoteBody: string;
  defaultDocSources: DefaultDocSource[];
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  noteStorage: NoteStoragePort;
};

type SeedDefaultNotesResult = {
  storageUpdated: boolean;
};

async function seedDefaultNotes({
  defaultPage,
  defaultNoteBody,
  defaultDocSources,
  deriveTitle,
  sanitizeNoteForSave,
  noteStorage,
}: SeedDefaultNotesParams): Promise<SeedDefaultNotesResult> {
  const seeds = createDefaultNoteSeeds({
    defaultPage,
    defaultNoteBody,
    defaultDocSources,
  });
  if (seeds.length === 0) {
    return { storageUpdated: false };
  }
  let storageUpdated = false;
  for (const seed of seeds) {
    const now = new Date().toISOString();
    const note = sanitizeNoteForSave({
      path: seed.path,
      title: deriveTitle(seed.path),
      body: seed.body,
      updatedAt: now,
    });
    try {
      await noteStorage.saveNote(note);
      storageUpdated = true;
    } catch (error) {
      console.error("Failed to seed default notes from bundled docs", error);
    }
  }
  return { storageUpdated };
}

type CreateDefaultNoteSeedsParams = {
  defaultPage: string;
  defaultNoteBody: string;
  defaultDocSources: DefaultDocSource[];
};

function createDefaultNoteSeeds({
  defaultPage,
  defaultNoteBody,
  defaultDocSources,
}: CreateDefaultNoteSeedsParams): NoteSeed[] {
  const seeds = new Map<string, NoteSeed>();
  seeds.set(defaultPage, { path: defaultPage, body: defaultNoteBody });
  for (const source of defaultDocSources) {
    const seed = mapDocSourceToSeed(source, defaultPage);
    if (!seed) {
      continue;
    }
    if (!seeds.has(seed.path)) {
      seeds.set(seed.path, seed);
    }
  }
  return Array.from(seeds.values());
}

function mapDocSourceToSeed(source: DefaultDocSource, defaultPage: string): NoteSeed | null {
  const match = source.sourcePath.match(/\/docs\/(.+)\.md$/);
  if (!match) {
    return null;
  }
  const relativePath = match[1];
  if (relativePath === "index") {
    return { path: defaultPage, body: source.body };
  }
  return {
    path: normalizePath(`/pages/${relativePath}`),
    body: source.body,
  };
}
