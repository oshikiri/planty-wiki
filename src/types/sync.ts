export const SYNC_INPUT_LIMITS = {
  path: 512,
  title: 1024,
  body: 50_000,
} as const;

export const DIRECTORY_IMPORT_LIMITS = {
  maxDepth: 20,
  maxFiles: 1_000,
  maxFileBytes: 1_000_000,
  maxTotalBytes: 20_000_000,
} as const;

export type PendingSyncChange = {
  operationId: string;
  noteId: string;
  path: string;
  title: string;
  body: string;
  deleted: boolean;
  baseVersion: number;
  createdAt: string;
};

type SyncConflictNote = {
  noteId: string;
  version: number;
  changeSequence: number;
  deleted: boolean;
  path: string | null;
  title: string | null;
  body: string | null;
  updatedAt: string;
};

export type SyncConflict = {
  noteId: string;
  operationId: string;
  baseVersion: number;
  local: PendingSyncChange;
  server: SyncConflictNote | null;
  createdAt: string;
};

export type CloudSyncResult =
  | {
      status: "idle" | "synced" | "deferred" | "unauthenticated" | "unavailable";
      syncedChanges: number;
      receivedChanges: number;
    }
  | {
      status: "conflict";
      syncedChanges: number;
      receivedChanges: number;
      noteId: string;
      conflict: SyncConflict;
    };

export type SyncActivityStatus = "syncing" | "synced" | "retrying";

export type SyncConflictResolution = { previousPath: string; path: string | null };

export type NoteChangeEvent = { type: "sync" } | ({ type: "resolution" } & SyncConflictResolution);
