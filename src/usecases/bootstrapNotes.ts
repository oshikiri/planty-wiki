import type { Dispatch, StateUpdater } from "preact/hooks";

import type { Route } from "../navigation/route";
import type { Router } from "../navigation/router";
import type { Note } from "../types/note";
import type { NoteService } from "../services/note-service";

type BootstrapNotesParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  setNotesFromStorage: (notes: Note[]) => void;
  setRoute: Dispatch<StateUpdater<Route>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  noteService: NoteService;
  router: Router;
  signal?: AbortSignal;
};

/**
 * 初期ロード時にノート一覧を取得し、ルーティングを決定・必要ならノートを作成するユースケース。
 *
 * @param params ストレージアクセスとUI更新に必要な依存
 * @returns 処理完了を待つPromise
 */
export async function bootstrapNotes({
  defaultPage,
  deriveTitle,
  sanitizeNoteForSave,
  setNotes,
  setNotesFromStorage,
  setRoute,
  setStatusMessage,
  noteService,
  router,
  signal,
}: BootstrapNotesParams): Promise<void> {
  try {
    const loaded = await noteService.loadNotes();
    if (signal?.aborted) {
      return;
    }
    setNotesFromStorage(loaded);
    const routeFromHash = router.getCurrentRoute();
    if (routeFromHash?.type === "query") {
      setRoute(routeFromHash);
      return;
    }
    if (routeFromHash?.type === "note") {
      await ensureNoteExists({
        normalized: routeFromHash.path,
        loaded,
        deriveTitle,
        sanitizeNoteForSave,
        setNotes,
        noteService,
        setStatusMessage,
        signal,
      });
      if (signal?.aborted) {
        return;
      }
      setRoute(routeFromHash);
      return;
    }
    if (loaded[0]) {
      const nextRoute: Route = { type: "note", path: loaded[0].path };
      setRoute(nextRoute);
      router.navigate(nextRoute);
      return;
    }
    await createDefaultNote({
      defaultPage,
      deriveTitle,
      sanitizeNoteForSave,
      setNotes,
      noteService,
      setStatusMessage,
      signal,
    });
    if (signal?.aborted) {
      return;
    }
    const defaultRoute: Route = { type: "note", path: defaultPage };
    setRoute(defaultRoute);
    router.navigate(defaultRoute);
  } catch (error) {
    if (signal?.aborted) {
      return;
    }
    console.error("Failed to bootstrap notes from storage", error);
    setStatusMessage("Failed to load notes, starting from an empty state");
    setNotesFromStorage([]);
    const fallbackRoute: Route = { type: "note", path: defaultPage };
    setRoute(fallbackRoute);
    router.navigate(fallbackRoute);
  }
}

type EnsureNoteExistsParams = {
  normalized: string;
  loaded: Note[];
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  noteService: NoteService;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  signal?: AbortSignal;
};

async function ensureNoteExists({
  normalized,
  loaded,
  deriveTitle,
  sanitizeNoteForSave,
  setNotes,
  noteService,
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
    await noteService.saveNote(newNote);
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
  setNotes: Dispatch<StateUpdater<Note[]>>;
  noteService: NoteService;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  signal?: AbortSignal;
};

async function createDefaultNote({
  defaultPage,
  deriveTitle,
  sanitizeNoteForSave,
  setNotes,
  noteService,
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
    await noteService.saveNote(fallbackNote);
  } catch (error) {
    if (!signal?.aborted) {
      console.error("Failed to create default note during bootstrap", error);
      setStatusMessage("Failed to create default note");
    }
  }
}
