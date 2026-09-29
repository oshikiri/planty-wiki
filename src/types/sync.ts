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
