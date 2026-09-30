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
      response: unknown;
    };
