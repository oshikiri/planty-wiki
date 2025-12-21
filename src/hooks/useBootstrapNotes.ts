import { useEffect, type Dispatch, type StateUpdater } from "preact/hooks";

import { normalizePath, parseHashPath } from "../navigation";
import type { NoteStorage } from "../storage";
import type { Note } from "../types/note";

type SetNotesFromStorage = (next: Note[]) => void;

export type UseBootstrapNotesParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  setNotesFromStorage: SetNotesFromStorage;
  setSelectedPath: Dispatch<StateUpdater<string>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  storage: NoteStorage;
};

/**
 * useBootstrapNotesは初回ロード時のノート取得とhash指定ページの作成を担当し、App側の副作用ロジックを簡潔に保つ。
 *
 * @param params defaultPageやストレージAPIなどブート処理に必要な依存をまとめたオブジェクト
 * @returns void
 */
export function useBootstrapNotes({
  defaultPage,
  deriveTitle,
  sanitizeNoteForSave,
  setNotes,
  setNotesFromStorage,
  setSelectedPath,
  setStatusMessage,
  storage,
}: UseBootstrapNotesParams) {
  useEffect(() => {
    let isMounted = true;
    async function bootstrap() {
      try {
        const loaded = await storage.loadNotes();
        if (!isMounted) return;
        setNotesFromStorage(loaded);
        const hashPath = parseHashPath();
        const normalized = hashPath ? normalizePath(hashPath) : null;
        if (normalized) {
          await ensureNoteExists({
            isMounted,
            normalized,
            loaded,
            deriveTitle,
            sanitizeNoteForSave,
            setNotes,
            storage,
            setStatusMessage,
          });
          if (isMounted) {
            setSelectedPath(normalized);
          }
          return;
        }
        if (loaded[0]) {
          if (isMounted) {
            setSelectedPath(loaded[0].path);
          }
          return;
        }
        if (isMounted) {
          await createDefaultNote({
            defaultPage,
            deriveTitle,
            sanitizeNoteForSave,
            setNotes,
            storage,
            setStatusMessage,
          });
          setSelectedPath(defaultPage);
        }
      } catch (error) {
        console.error("Failed to bootstrap notes from storage", error);
        if (!isMounted) return;
        setStatusMessage("Failed to load notes, starting from an empty state");
        setNotesFromStorage([]);
        setSelectedPath(defaultPage);
      }
    }
    bootstrap();
    return () => {
      isMounted = false;
    };
  }, [
    defaultPage,
    deriveTitle,
    sanitizeNoteForSave,
    setNotes,
    setNotesFromStorage,
    setSelectedPath,
    setStatusMessage,
    storage,
  ]);
}

type EnsureNoteExistsParams = {
  isMounted: boolean;
  normalized: string;
  loaded: Note[];
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  storage: NoteStorage;
  setStatusMessage: Dispatch<StateUpdater<string>>;
};

async function ensureNoteExists({
  isMounted,
  normalized,
  loaded,
  deriveTitle,
  sanitizeNoteForSave,
  setNotes,
  storage,
  setStatusMessage,
}: EnsureNoteExistsParams) {
  const exists = loaded.some((note) => note.path === normalized);
  if (exists || !isMounted) {
    return;
  }
  const newNote = sanitizeNoteForSave({
    path: normalized,
    title: deriveTitle(normalized),
    body: "",
  });
  setNotes((prev) => [...prev, newNote]);
  try {
    await storage.saveNote(newNote);
  } catch (error) {
    console.error("Failed to create note via bootstrap hash handling", error);
    if (isMounted) {
      setStatusMessage("Failed to create note from hash");
    }
  }
}

type CreateDefaultNoteParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  storage: NoteStorage;
  setStatusMessage: Dispatch<StateUpdater<string>>;
};

async function createDefaultNote({
  defaultPage,
  deriveTitle,
  sanitizeNoteForSave,
  setNotes,
  storage,
  setStatusMessage,
}: CreateDefaultNoteParams) {
  const fallbackNote = sanitizeNoteForSave({
    path: defaultPage,
    title: deriveTitle(defaultPage),
    body: "",
  });
  setNotes([fallbackNote]);
  try {
    await storage.saveNote(fallbackNote);
  } catch (error) {
    console.error("Failed to create default note during bootstrap", error);
    setStatusMessage("Failed to create default note");
  }
}
