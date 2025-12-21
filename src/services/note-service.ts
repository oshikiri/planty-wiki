import { exportNotesToDirectory, importMarkdownFromDirectory } from "../storage/file-bridge";
import { createStorage, type NoteStorage } from "../storage";
import type { Note, SearchResult } from "../types/note";

export type NoteService = {
  loadNotes: () => Promise<Note[]>;
  saveNote: (note: Note) => Promise<void>;
  deleteNote: (path: Note["path"]) => Promise<void>;
  importFromDirectory: (params: {
    applyImportedNotes: (notes: Note[]) => void;
    setStatusMessage: (message: string) => void;
  }) => Promise<void>;
  exportToDirectory: (params: {
    notes: Note[];
    setStatusMessage: (message: string) => void;
  }) => Promise<void>;
  searchNotes: (query: string) => Promise<SearchResult[]>;
  listBacklinks: (targetPath: Note["path"]) => Promise<Note[]>;
};

/**
 * 本番向けのNoteServiceを生成する。内部でストレージ実装を初期化し、UIからの依存を隠蔽する。
 *
 * @returns OPFS SQLite バックエンドへ委譲するNoteService
 */
export function createNoteService(): NoteService {
  const storage = createStorage();
  return createNoteServiceFromStorage(storage);
}

/**
 * 指定されたNoteStorageをラップしてNoteServiceを構築する。UIテスト向けのモック差し替えにも利用する。
 *
 * @param storage 永続層の具体実装
 * @returns storageを委譲先とするNoteService
 */
export function createNoteServiceFromStorage(storage: NoteStorage): NoteService {
  return {
    async loadNotes() {
      return storage.loadNotes();
    },
    async saveNote(note: Note) {
      await storage.saveNote(note);
    },
    async deleteNote(path: Note["path"]) {
      await storage.deleteNote(path);
    },
    async importFromDirectory({ applyImportedNotes, setStatusMessage }) {
      await importMarkdownFromDirectory(storage, applyImportedNotes, setStatusMessage);
    },
    async exportToDirectory({ notes, setStatusMessage }) {
      await exportNotesToDirectory(notes, setStatusMessage);
    },
    async searchNotes(query: string) {
      if (typeof storage.searchNotes !== "function") {
        return [];
      }
      return storage.searchNotes(query);
    },
    async listBacklinks(targetPath: Note["path"]) {
      return storage.listBacklinks(targetPath);
    },
  };
}

/**
 * 永続層に依存しないインメモリ実装のNoteServiceを生成し、UIテストのモックに利用する。
 *
 * @param initialNotes 初期投入するノート配列
 * @returns インメモリで完結するNoteService
 */
export function createInMemoryNoteService(initialNotes: Note[] = []): NoteService {
  let notes = [...initialNotes];
  return {
    async loadNotes() {
      return [...notes];
    },
    async saveNote(note: Note) {
      const index = notes.findIndex((entry) => entry.path === note.path);
      if (index === -1) {
        notes = [...notes, note];
        return;
      }
      const copy = [...notes];
      copy[index] = note;
      notes = copy;
    },
    async deleteNote(path: Note["path"]) {
      notes = notes.filter((note) => note.path !== path);
    },
    async importFromDirectory({ applyImportedNotes }) {
      applyImportedNotes([...notes]);
    },
    async exportToDirectory() {
      return;
    },
    async searchNotes(query: string) {
      const trimmed = query.trim();
      if (!trimmed) {
        return [];
      }
      return notes
        .filter((note) => note.title.includes(trimmed) || note.body.includes(trimmed))
        .map((note) => ({
          path: note.path,
          title: note.title,
          snippet: "",
        }));
    },
    async listBacklinks(targetPath: Note["path"]) {
      return notes.filter((note) => note.body.includes(targetPath));
    },
  };
}
