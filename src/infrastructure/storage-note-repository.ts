import type { NoteRepository } from "../domain/note-repository";
import type {
  CloudSyncResult,
  PendingSyncChange,
  SyncConflict,
  SyncConflictResolution,
} from "../types/sync";
import type { Note, NoteSummary } from "../domain/note";
import { createStorage, type NoteStorage } from "../storage";

/**
 * StorageNoteRepository delegates every NoteRepository call to the injected storage backend.
 */
class StorageNoteRepository implements NoteRepository {
  constructor(private readonly storage: NoteStorage) {}

  loadSummaries(): Promise<NoteSummary[]> {
    return this.storage.loadNoteSummaries();
  }

  loadByPath(path: Note["path"]): Promise<Note | null> {
    return this.storage.loadNote(path);
  }

  loadAll(): Promise<Note[]> {
    return this.storage.loadNotes();
  }

  save(note: Note): Promise<void> {
    return this.storage.saveNote(note);
  }

  delete(path: Note["path"]): Promise<void> {
    return this.storage.deleteNote(path);
  }

  loadPendingSyncChanges(): Promise<PendingSyncChange[]> {
    return this.storage.loadPendingSyncChanges();
  }

  loadSyncConflicts(): Promise<SyncConflict[]> {
    return this.storage.loadSyncConflicts();
  }

  resolveSyncConflict(
    noteId: string,
    choice: "local" | "server",
    path?: string,
  ): Promise<SyncConflictResolution> {
    return this.storage.resolveSyncConflict(noteId, choice, path);
  }

  syncPendingChanges(): Promise<CloudSyncResult> {
    return this.storage.syncPendingChanges();
  }

  importBatch(notes: Note[]): Promise<void> {
    return this.storage.importNotes(notes);
  }

  listBacklinks(targetPath: Note["path"]): Promise<Note[]> {
    return this.storage.listBacklinks(targetPath);
  }
}

/**
 * Creates a NoteRepository backed by the OPFS + SQLite storage backend.
 *
 * @returns NoteRepository instance that persists notes via OPFS
 */
export function createOpfsNoteRepository(): NoteRepository {
  const storage = createStorage();
  return new StorageNoteRepository(storage);
}
