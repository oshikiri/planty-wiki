import type { Note, NoteSummary } from "./note";

/**
 * NoteRepository defines the abstraction layer for note storage.
 */
export interface NoteRepository {
  loadSummaries(): Promise<NoteSummary[]>;
  loadByPath(path: Note["path"]): Promise<Note | null>;
  loadAll(): Promise<Note[]>;
  save(note: Note): Promise<void>;
  delete(path: Note["path"]): Promise<void>;
  importBatch(notes: Note[]): Promise<void>;
  listBacklinks(targetPath: Note["path"]): Promise<Note[]>;
}
