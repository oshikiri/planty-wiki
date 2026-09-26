export type D1Result = {
  meta?: {
    last_row_id?: number;
  };
};

export type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<D1Result>;
};

type SyncDatabase = {
  prepare(query: string): D1PreparedStatement;
  batch<T extends D1Result>(statements: D1PreparedStatement[]): Promise<T[]>;
};

type SyncEnvironment = {
  DB?: SyncDatabase;
};

export type SyncContext = {
  request: Request;
  env: SyncEnvironment;
  params?: Record<string, string | undefined>;
};

export type NoteRow = {
  note_id: string;
  path: string;
  title: string;
  body: string;
  version: number;
  change_sequence: number;
  deleted_at: string | null;
  updated_at: string;
};

export type OperationRow = {
  note_id: string;
  request_hash: string;
  response: string;
};

export type ChangeRow = {
  change_sequence: number;
  note_id: string;
  version: number;
  kind: "upsert" | "delete";
  path: string | null;
  title: string | null;
  body: string | null;
  deleted_at: string | null;
  updated_at: string;
};
