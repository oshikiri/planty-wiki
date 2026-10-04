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
  SyncActivityStatus,
  SyncConflict,
  NoteChangeEvent,
} from "../types/sync";
import { createSyncController } from "./sync-controller";
import { createBundledDocRefresh } from "./bundled-doc-refresh";
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
  getSyncActivityStatus: () => SyncActivityStatus;
  subscribeToSyncActivity: (listener: (status: SyncActivityStatus) => void) => () => void;
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
    async () => {
      await refreshBundledDocs();
      return repository.syncPendingChanges();
    },
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
  const refreshBundledDocs = createBundledDocRefresh(repository, triggerSync);
  return {
    ...createNoteAccessors(repository, sync.run, refreshBundledDocs),
    ...createNoteMutations(repository, triggerSync, notify, refreshBundledDocs),
    ...createMarkdownTransfer(repository, refreshBundledDocs),
    ...createSyncAccessors(repository, refreshBundledDocs),
    syncPendingChanges: sync.run,
    getSyncActivityStatus: sync.getStatus,
    subscribeToSyncActivity: sync.subscribe,
    startSyncLifecycle: sync.start,
    subscribeToChanges(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function createSyncAccessors(repository: NoteRepository, refreshBundledDocs: () => Promise<void>) {
  return {
    async loadPendingSyncChanges() {
      await refreshBundledDocs();
      return repository.loadPendingSyncChanges();
    },
    async loadSyncConflicts() {
      await refreshBundledDocs();
      return repository.loadSyncConflicts();
    },
  };
}

function createNoteAccessors(
  repository: NoteRepository,
  synchronize: () => Promise<CloudSyncResult>,
  refreshBundledDocs: () => Promise<void>,
) {
  return {
    async loadNoteSummaries() {
      await refreshBundledDocs();
      try {
        await synchronize();
      } catch (error) {
        console.warn("Initial Cloud Sync is unavailable", error);
      }
      const summaries = await repository.loadSummaries();
      return summaries;
    },
    async loadNote(path: Note["path"]) {
      await refreshBundledDocs();
      return repository.loadByPath(path);
    },
    async loadNotes() {
      await refreshBundledDocs();
      return repository.loadAll();
    },
    async listBacklinks(targetPath: Note["path"]) {
      await refreshBundledDocs();
      return repository.listBacklinks(targetPath);
    },
  };
}

function createNoteMutations(
  repository: NoteRepository,
  triggerSync: () => void,
  notify: (event: NoteChangeEvent) => Promise<void>,
  refreshBundledDocs: () => Promise<void>,
) {
  return {
    async saveNote(note: Note) {
      await refreshBundledDocs();
      await repository.save(note);
      triggerSync();
    },
    async deleteNote(path: Note["path"]) {
      await refreshBundledDocs();
      await repository.delete(path);
      triggerSync();
    },
    async resolveSyncConflict(noteId: string, choice: "local" | "server", path?: string) {
      await refreshBundledDocs();
      const result = await repository.resolveSyncConflict(noteId, choice, path);
      await notify({ type: "resolution", ...result });
      triggerSync();
    },
  };
}

function createMarkdownTransfer(
  repository: NoteRepository,
  refreshBundledDocs: () => Promise<void>,
) {
  return {
    async importFromDirectory(signal?: AbortSignal, onSaving?: () => void) {
      await refreshBundledDocs();
      return importMarkdownFromDirectory(repository, signal, onSaving);
    },
    async exportToDirectory(notes: Note[]) {
      return exportNotesToDirectory(notes);
    },
  };
}
