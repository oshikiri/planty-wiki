import type { NoteRepository } from "../domain/note-repository";
import type { Note } from "../domain/note";
import { createStorage, type NoteStorage } from "../storage";
import type { SearchResult } from "../types/note";

/**
 * OpfsNoteRepository is a NoteRepository implementation that delegates to the OPFS + SQLite storage.
 */
export class OpfsNoteRepository implements NoteRepository {
  constructor(private readonly storage: NoteStorage) {}

  loadAll(): Promise<Note[]> {
    return this.storage.loadNotes();
  }

  save(note: Note): Promise<void> {
    return this.storage.saveNote(note);
  }

  delete(path: Note["path"]): Promise<void> {
    return this.storage.deleteNote(path);
  }

  importBatch(notes: Note[]): Promise<void> {
    return this.storage.importNotes(notes);
  }

  async search(query: string): Promise<SearchResult[]> {
    if (typeof this.storage.searchNotes !== "function") {
      return [];
    }
    return this.storage.searchNotes(query);
  }

  listBacklinks(targetPath: Note["path"]): Promise<Note[]> {
    return this.storage.listBacklinks(targetPath);
  }
}

export function createOpfsNoteRepository(): NoteRepository {
  const storage = createStorage();
  return new OpfsNoteRepository(storage);
}
