import { exportNotesToDirectory, importMarkdownFromDirectory } from "../storage/file-bridge";
import type { Note, SearchResult } from "../types/note";
import type { NoteRepository } from "../domain/note-repository";

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
 * 指定されたNoteRepositoryをラップしてNoteServiceを構築する。UIテスト向けのモック差し替えにも利用する。
 *
 * @param repository 永続層の抽象化
 * @returns repositoryを委譲先とするNoteService
 */
export function createNoteService(repository: NoteRepository): NoteService {
  return {
    async loadNotes() {
      return repository.loadAll();
    },
    async saveNote(note: Note) {
      await repository.save(note);
    },
    async deleteNote(path: Note["path"]) {
      await repository.delete(path);
    },
    async importFromDirectory({ applyImportedNotes, setStatusMessage }) {
      await importMarkdownFromDirectory(repository, applyImportedNotes, setStatusMessage);
    },
    async exportToDirectory({ notes, setStatusMessage }) {
      await exportNotesToDirectory(notes, setStatusMessage);
    },
    async searchNotes(query: string) {
      return repository.search(query);
    },
    async listBacklinks(targetPath: Note["path"]) {
      return repository.listBacklinks(targetPath);
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
  const repository: NoteRepository = createInMemoryRepository(initialNotes);
  return createNoteService(repository);
}

function createInMemoryRepository(initialNotes: Note[]): NoteRepository {
  let notes = [...initialNotes];
  return {
    async loadAll() {
      return [...notes];
    },
    async save(note: Note) {
      const index = notes.findIndex((entry) => entry.path === note.path);
      if (index === -1) {
        notes = [...notes, note];
        return;
      }
      const copy = [...notes];
      copy[index] = note;
      notes = copy;
    },
    async delete(path: Note["path"]) {
      notes = notes.filter((note) => note.path !== path);
    },
    async importBatch(imported: Note[]) {
      notes = [...imported];
    },
    async search(query: string): Promise<SearchResult[]> {
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
