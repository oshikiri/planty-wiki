import {
  exportNotesToDirectory,
  importMarkdownFromDirectory,
  type ExportNotesResult,
  type ImportMarkdownResult,
} from "../storage/file-bridge";
import type { Note, NoteSummary } from "../types/note";
import type { NoteRepository } from "../domain/note-repository";

export type NoteService = {
  loadNoteSummaries: () => Promise<NoteSummary[]>;
  loadNote: (path: Note["path"]) => Promise<Note | null>;
  loadNotes: () => Promise<Note[]>;
  saveNote: (note: Note) => Promise<void>;
  deleteNote: (path: Note["path"]) => Promise<void>;
  importFromDirectory: () => Promise<ImportMarkdownResult>;
  exportToDirectory: (notes: Note[]) => Promise<ExportNotesResult>;
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
    async listBacklinks(targetPath: Note["path"]) {
      return repository.listBacklinks(targetPath);
    },
  };
}
