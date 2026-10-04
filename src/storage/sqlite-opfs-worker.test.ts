/// <reference types="node" />
// @vitest-environment node
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from "node:sqlite";
import { createContext, runInContext } from "node:vm";
import { afterEach, expect, it } from "vitest";
import type { PendingSyncChange, SyncConflict, SyncConflictResolution } from "../types/sync";

type Db = {
  exec: (options: {
    sql: string;
    bind?: Record<string, SQLInputValue>;
    callback?: (row: Record<string, SQLOutputValue>) => void;
  }) => void;
};
type ServerNote = NonNullable<SyncConflict["server"]>;
type WorkerApi = {
  markRequestCancelled: (id: number) => void;
  initializeSyncStructures: (db: Db) => void;
  handleSaveNote: (db: Db, id: number, note: { path: string; title: string; body: string }) => void;
  handleDeleteNote: (db: Db, id: number, note: { path: string }) => void;
  readPendingSyncChanges: (db: Db) => PendingSyncChange[];
  recordSyncConflict: (
    db: Db,
    change: PendingSyncChange,
    response: { note?: ServerNote; error?: string },
  ) => void;
  readSyncConflicts: (db: Db) => SyncConflict[];
  handleResolveSyncConflict: (
    db: Db,
    id: number,
    payload: { noteId: string; choice: "local" | "server"; path?: string },
  ) => Promise<void>;
  applyRemoteChanges: (
    db: Db,
    changes: object[],
    cursor: number,
  ) => { nextAfter: number; receivedChanges: number };
  readSyncCursor: (db: Db) => number;
};
const databases: DatabaseSync[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function createWorker() {
  const sqlite = new DatabaseSync(":memory:");
  databases.push(sqlite);
  sqlite.exec(
    "CREATE TABLE pages(path TEXT PRIMARY KEY,title TEXT,body TEXT,updated_at TEXT); " +
      "CREATE TABLE links(source_path TEXT,target_path TEXT,display TEXT,PRIMARY KEY(source_path,target_path,display))",
  );
  const db: Db = {
    exec({ sql, bind, callback }) {
      const statement = sqlite.prepare(sql);
      if (callback) {
        const rows = bind ? statement.all(bind) : statement.all();
        for (const row of rows) callback(row);
      } else if (bind) statement.run(bind);
      else statement.run();
    },
  };
  const messages: { ok: boolean; error?: string; result?: SyncConflictResolution }[] = [];
  const context = createContext({
    console,
    URL,
    fetch,
    self: {
      crypto: webcrypto,
      postMessage: (message: (typeof messages)[number]) => messages.push(message),
      location: { origin: "https://example.test" },
    },
  });
  runInContext(readFileSync("public/sqlite-opfs-worker.js", "utf8"), context);
  const worker = context as unknown as WorkerApi;
  worker.initializeSyncStructures(db);
  const save = (body: string, path = "/pages/test") =>
    worker.handleSaveNote(db, 1, { path, title: "Test", body });
  save("Initial local");
  const pending = worker.readPendingSyncChanges(db)[0];
  const server: ServerNote = {
    noteId: pending.noteId,
    version: 2,
    changeSequence: 2,
    path: pending.path,
    title: "Test",
    body: "Server",
    deleted: false,
    updatedAt: "2026-10-04T00:00:00Z",
  };
  const conflict = (note = server) => worker.recordSyncConflict(db, pending, { note });
  const resolve = (choice: "local" | "server", path?: string) =>
    worker.handleResolveSyncConflict(db, 2, { noteId: pending.noteId, choice, path });
  const pages = () => sqlite.prepare("SELECT path, body FROM pages ORDER BY path").all();
  return { worker, sqlite, db, save, pending, server, conflict, resolve, messages, pages };
}

it("keeps edits made after a conflict and rebases them onto the server version", async () => {
  const f = createWorker();
  f.conflict();
  f.save("Latest local");
  expect(f.worker.readPendingSyncChanges(f.db)).toEqual([]);
  expect(f.worker.readSyncConflicts(f.db)[0].local.body).toBe("Latest local");
  await f.resolve("local");
  expect(f.worker.readPendingSyncChanges(f.db)[0]).toMatchObject({
    body: "Latest local",
    baseVersion: 2,
  });
  expect(f.pages()).toEqual([{ path: "/pages/test", body: "Latest local" }]);
  expect(f.worker.readSyncConflicts(f.db)).toEqual([]);
});
it("preserves an edit made while a conflicting network response is in flight", () => {
  const f = createWorker();
  f.save("Edit during request");
  f.conflict();
  expect(f.worker.readSyncConflicts(f.db)[0].local.body).toBe("Edit during request");
  expect(f.worker.readPendingSyncChanges(f.db)).toEqual([]);
});
it("adopts the server version without retaining later local operations", async () => {
  const f = createWorker();
  f.conflict();
  f.save("Latest local");
  await f.resolve("server");
  expect(f.pages()).toEqual([{ path: "/pages/test", body: "Server" }]);
  expect(f.worker.readPendingSyncChanges(f.db)).toEqual([]);
  expect(f.worker.readSyncConflicts(f.db)).toEqual([]);
});
it("preserves a conflict when the server path is occupied locally", async () => {
  const f = createWorker();
  f.save("Other", "/pages/other");
  f.conflict({ ...f.server, path: "/pages/other" });
  await f.resolve("server");
  expect(f.messages.at(-1)?.ok).toBe(false);
  expect(f.worker.readSyncConflicts(f.db)).toHaveLength(1);
  expect(f.pages()).toEqual([
    { path: "/pages/other", body: "Other" },
    { path: "/pages/test", body: "Initial local" },
  ]);
});
it("commits unrelated changes received before an unresolved conflict", () => {
  const f = createWorker();
  f.conflict();
  const result = f.worker.applyRemoteChanges(
    f.db,
    [
      {
        ...f.server,
        noteId: webcrypto.randomUUID(),
        path: "/pages/unrelated",
        changeSequence: 1,
        version: 1,
        kind: "upsert",
      },
      { ...f.server, kind: "upsert" },
    ],
    0,
  );
  expect(result).toMatchObject({ nextAfter: 1, receivedChanges: 1 });
  expect(f.worker.readSyncCursor(f.db)).toBe(1);
  expect(f.pages()).toContainEqual({ path: "/pages/unrelated", body: "Server" });
});
it("allows a path conflict to be resolved by saving the latest version at a new path", async () => {
  const f = createWorker();
  f.worker.recordSyncConflict(f.db, f.pending, { error: "path_conflict" });
  f.save("Latest local");
  await f.resolve("local", "/pages/renamed");
  expect(f.messages.at(-1)?.ok).toBe(true);
  expect(f.pages()).toEqual([{ path: "/pages/renamed", body: "Latest local" }]);
  expect(f.worker.readPendingSyncChanges(f.db)[0]).toMatchObject({
    noteId: f.pending.noteId,
    path: "/pages/renamed",
    body: "Latest local",
  });
});
it("does not discard a conflict when the replacement path is invalid or occupied", async () => {
  const f = createWorker();
  f.save("Other", "/pages/other");
  f.worker.recordSyncConflict(f.db, f.pending, { error: "path_conflict" });
  for (const path of ["/pages/../unsafe", "/pages/other", "/pages/test"]) {
    await f.resolve("local", path);
    expect(f.messages.at(-1)?.ok).toBe(false);
    expect(f.worker.readSyncConflicts(f.db)).toHaveLength(1);
  }
});
it("can discard an unsyncable local note without deleting other local notes", async () => {
  const f = createWorker();
  f.save("Other", "/pages/other");
  f.worker.recordSyncConflict(f.db, f.pending, { error: "path_conflict" });
  await f.resolve("server");
  expect(f.pages()).toEqual([{ path: "/pages/other", body: "Other" }]);
  expect(f.worker.readSyncConflicts(f.db)).toEqual([]);
  expect(f.worker.readPendingSyncChanges(f.db)).toHaveLength(1);
});
it("keeps a local deletion made after the conflict", async () => {
  const f = createWorker();
  f.conflict();
  f.worker.handleDeleteNote(f.db, 3, { path: f.pending.path });
  await f.resolve("local");
  expect(f.pages()).toEqual([]);
  expect(f.worker.readPendingSyncChanges(f.db)[0]).toMatchObject({
    deleted: true,
    baseVersion: 2,
  });
});

it("does not apply a queued resolution after its caller cancels the request", async () => {
  const f = createWorker();
  f.conflict();
  const resolution = f.resolve("server");
  f.worker.markRequestCancelled(2);
  await resolution;
  expect(f.pages()).toEqual([{ path: "/pages/test", body: "Initial local" }]);
  expect(f.worker.readSyncConflicts(f.db)).toHaveLength(1);
});
