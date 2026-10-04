import {
  exportNotesToDirectory,
  importMarkdownFromDirectory,
  type ExportNotesResult,
  type ImportMarkdownResult,
} from "../storage/file-bridge";
import type { Note, NoteSummary } from "../types/note";
import type {
  CloudSyncResult,
  PendingSyncChange,
  SyncConflict,
  NoteChangeEvent,
} from "../types/sync";
import { createSyncController } from "./sync-controller";
import type { NoteRepository } from "../domain/note-repository";

export type NoteService = {
  loadNoteSummaries: () => Promise<NoteSummary[]>;
  loadNote: (path: Note["path"]) => Promise<Note | null>;
  loadNotes: () => Promise<Note[]>;
  saveNote: (note: Note) => Promise<void>;
  deleteNote: (path: Note["path"]) => Promise<void>;
  loadPendingSyncChanges: () => Promise<PendingSyncChange[]>;
  loadSyncConflicts: () => Promise<SyncConflict[]>;
  resolveSyncConflict: (noteId: string, choice: "local" | "server", path?: string) => Promise<void>;
  syncPendingChanges: () => Promise<CloudSyncResult>;
  startSyncLifecycle: () => () => void;
  subscribeToChanges: (listener: (event: NoteChangeEvent) => void | Promise<void>) => () => void;
  importFromDirectory: (
    signal?: AbortSignal,
    onSaving?: () => void,
  ) => Promise<ImportMarkdownResult>;
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
  const listeners = new Set<(event: NoteChangeEvent) => void | Promise<void>>();
  const notify = async (event: NoteChangeEvent) => {
    await Promise.all([...listeners].map((listener) => listener(event)));
  };
  const sync = createSyncController(
    () => repository.syncPendingChanges(),
    (result) => {
      if (result.receivedChanges > 0) {
        void notify({ type: "sync" }).catch((error) =>
          console.error("Failed to refresh synchronized notes", error),
        );
      }
    },
  );
  const triggerSync = () => {
    void sync.run().catch((error) => console.warn("Background Cloud Sync is unavailable", error));
  };
  return {
    ...createNoteAccessors(repository, sync.run),
    ...createNoteMutations(repository, triggerSync, notify),
    ...createMarkdownTransfer(repository),
    loadPendingSyncChanges: () => repository.loadPendingSyncChanges(),
    loadSyncConflicts: () => repository.loadSyncConflicts(),
    syncPendingChanges: sync.run,
    startSyncLifecycle: sync.start,
    subscribeToChanges(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function createNoteAccessors(
  repository: NoteRepository,
  synchronize: () => Promise<CloudSyncResult>,
) {
  return {
    async loadNoteSummaries() {
      try {
        await synchronize();
      } catch (error) {
        console.warn("Initial Cloud Sync is unavailable", error);
      }
      const summaries = await repository.loadSummaries();
      return summaries;
    },
    async loadNote(path: Note["path"]) {
      return repository.loadByPath(path);
    },
    async loadNotes() {
      return repository.loadAll();
    },
    async listBacklinks(targetPath: Note["path"]) {
      return repository.listBacklinks(targetPath);
    },
  };
}

function createNoteMutations(
  repository: NoteRepository,
  triggerSync: () => void,
  notify: (event: NoteChangeEvent) => Promise<void>,
) {
  return {
    async saveNote(note: Note) {
      await repository.save(note);
      triggerSync();
    },
    async deleteNote(path: Note["path"]) {
      await repository.delete(path);
      triggerSync();
    },
    async resolveSyncConflict(noteId: string, choice: "local" | "server", path?: string) {
      const result = await repository.resolveSyncConflict(noteId, choice, path);
      await notify({ type: "resolution", ...result });
      triggerSync();
    },
  };
}

function createMarkdownTransfer(repository: NoteRepository) {
  return {
    async importFromDirectory(signal?: AbortSignal, onSaving?: () => void) {
      return importMarkdownFromDirectory(repository, signal, onSaving);
    },
    async exportToDirectory(notes: Note[]) {
      return exportNotesToDirectory(notes);
    },
  };
}
