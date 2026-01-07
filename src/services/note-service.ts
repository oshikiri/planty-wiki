import {
  exportNotesToDirectory,
  importMarkdownFromDirectory,
  type ExportNotesResult,
  type ImportMarkdownResult,
} from "../storage/file-bridge";
import type { Note, NoteSummary, SearchResult } from "../types/note";
import type { NoteRepository } from "../domain/note-repository";

export type NoteService = {
  loadNoteSummaries: () => Promise<NoteSummary[]>;
  loadNote: (path: Note["path"]) => Promise<Note | null>;
  loadNotes: () => Promise<Note[]>;
  saveNote: (note: Note) => Promise<void>;
  deleteNote: (path: Note["path"]) => Promise<void>;
  importFromDirectory: () => Promise<ImportMarkdownResult>;
  exportToDirectory: (notes: Note[]) => Promise<ExportNotesResult>;
  searchNotes: (query: string) => Promise<SearchResult[]>;
  listBacklinks: (targetPath: Note["path"]) => Promise<Note[]>;
};

/**
 * Wraps the given NoteRepository to build a NoteService, allowing easy mocking in UI tests.
 *
 * @param repository Abstraction of the persistence layer
 * @returns NoteService that delegates to the repository
 */
export function createNoteService(repository: NoteRepository): NoteService {
  return {
    async loadNoteSummaries() {
      return repository.loadSummaries();
    },
    async loadNote(path: Note["path"]) {
      return repository.loadByPath(path);
    },
    async loadNotes() {
      return repository.loadAll();
    },
    async saveNote(note: Note) {
      await repository.save(note);
    },
    async deleteNote(path: Note["path"]) {
      await repository.delete(path);
    },
    async importFromDirectory() {
      return importMarkdownFromDirectory(repository);
    },
    async exportToDirectory(notes: Note[]) {
      return exportNotesToDirectory(notes);
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
 * Creates an in-memory NoteService independent from the persistence layer for UI testing.
 *
 * @param initialNotes Array of notes used to seed the service
 * @returns NoteService that operates entirely in memory
 */
export function createInMemoryNoteService(initialNotes: Note[] = []): NoteService {
  const repository: NoteRepository = createInMemoryRepository(initialNotes);
  return createNoteService(repository);
}

function createInMemoryRepository(initialNotes: Note[]): NoteRepository {
  let notes = [...initialNotes];
  return {
    async loadSummaries() {
      return notes.map((note) => ({
        path: note.path,
        title: note.title,
        updatedAt: note.updatedAt,
      }));
    },
    async loadByPath(path: Note["path"]) {
      return notes.find((note) => note.path === path) ?? null;
    },
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
