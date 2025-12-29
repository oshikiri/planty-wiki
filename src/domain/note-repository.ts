import type { Note, SearchResult } from "./note";

/**
 * NoteRepository defines the abstraction layer for note storage.
 */
export interface NoteRepository {
  loadAll(): Promise<Note[]>;
  save(note: Note): Promise<void>;
  delete(path: Note["path"]): Promise<void>;
  importBatch(notes: Note[]): Promise<void>;
  search(query: string): Promise<SearchResult[]>;
  listBacklinks(targetPath: Note["path"]): Promise<Note[]>;
}
