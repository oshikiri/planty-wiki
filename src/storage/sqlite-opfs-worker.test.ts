/// <reference types="node" />
// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from "node:sqlite";
import { createContext, runInContext } from "node:vm";
import { afterEach, expect, it } from "vitest";
import type { PendingSyncChange, SyncConflict, SyncConflictResolution } from "../types/sync";
import type { BundledDoc } from "../domain/bundled-doc";

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
  initializeBundledDocStructures: (db: Db) => void;
  handleRefreshBundledDocs: (db: Db, id: number, docs: BundledDoc[]) => void;
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
  worker.initializeBundledDocStructures(db);
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

it("競合後の編集内容を保持し、サーバー側の版を基準に更新する", async () => {
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
it("競合を示すネットワーク応答を待つ間に行った編集を保持する", () => {
  const f = createWorker();
  f.save("Edit during request");
  f.conflict();
  expect(f.worker.readSyncConflicts(f.db)[0].local.body).toBe("Edit during request");
  expect(f.worker.readPendingSyncChanges(f.db)).toEqual([]);
});
it("競合後のローカル操作を破棄してサーバー側の内容を採用する", async () => {
  const f = createWorker();
  f.conflict();
  f.save("Latest local");
  await f.resolve("server");
  expect(f.pages()).toEqual([{ path: "/pages/test", body: "Server" }]);
  expect(f.worker.readPendingSyncChanges(f.db)).toEqual([]);
  expect(f.worker.readSyncConflicts(f.db)).toEqual([]);
});
it("サーバー側のパスがローカルで使用済みの場合に競合を保持する", async () => {
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
it("未解決の競合より前に受信した無関係な変更を確定する", () => {
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
it("最新の内容を新しいパスに保存してパスの競合を解決できる", async () => {
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
it("変更先のパスが無効または使用済みの場合に競合を破棄しない", async () => {
  const f = createWorker();
  f.save("Other", "/pages/other");
  f.worker.recordSyncConflict(f.db, f.pending, { error: "path_conflict" });
  for (const path of ["/pages/../unsafe", "/pages/other", "/pages/test"]) {
    await f.resolve("local", path);
    expect(f.messages.at(-1)?.ok).toBe(false);
    expect(f.worker.readSyncConflicts(f.db)).toHaveLength(1);
  }
});
it("他のローカルノートを削除せずに同期できないローカルノートを破棄できる", async () => {
  const f = createWorker();
  f.save("Other", "/pages/other");
  f.worker.recordSyncConflict(f.db, f.pending, { error: "path_conflict" });
  await f.resolve("server");
  expect(f.pages()).toEqual([{ path: "/pages/other", body: "Other" }]);
  expect(f.worker.readSyncConflicts(f.db)).toEqual([]);
  expect(f.worker.readPendingSyncChanges(f.db)).toHaveLength(1);
});
it("競合後にローカルで行った削除を保持する", async () => {
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

it("呼び出し元が要求をキャンセルした場合に待機中の競合解決を適用しない", async () => {
  const f = createWorker();
  f.conflict();
  const resolution = f.resolve("server");
  f.worker.markRequestCancelled(2);
  await resolution;
  expect(f.pages()).toEqual([{ path: "/pages/test", body: "Initial local" }]);
  expect(f.worker.readSyncConflicts(f.db)).toHaveLength(1);
});

function bundledDoc(body: string, path = "/pages/test"): BundledDoc {
  return { path, body, hash: createHash("sha256").update(body).digest("hex") };
}

it("同梱の元データに変更がない場合は再起動後もユーザーの編集を保持する", () => {
  const f = createWorker();
  const doc = bundledDoc("Bundled");
  f.worker.handleRefreshBundledDocs(f.db, 4, [doc]);
  f.save("My edits");
  const pending = f.worker.readPendingSyncChanges(f.db);
  const timestamp = f.sqlite.prepare("SELECT updated_at FROM pages").get();
  f.worker.initializeBundledDocStructures(f.db);
  f.worker.handleRefreshBundledDocs(f.db, 5, [doc]);
  expect(f.pages()).toEqual([{ path: doc.path, body: "My edits" }]);
  expect(f.worker.readPendingSyncChanges(f.db)).toEqual(pending);
  expect(f.sqlite.prepare("SELECT updated_at FROM pages").get()).toEqual(timestamp);
});

it("同梱の元データが変わった場合にだけ編集済みページとバックリンクと同期データを置き換える", () => {
  const f = createWorker();
  const first = bundledDoc("First [[old]]");
  const other = bundledDoc("Other", "/pages/other");
  f.save("Other", other.path);
  f.worker.handleRefreshBundledDocs(f.db, 4, [first, other]);
  f.save("My edits [[local]]");
  f.save("Other edits", other.path);
  const next = bundledDoc("Second [[new]]");
  f.worker.handleRefreshBundledDocs(f.db, 5, [next, other]);
  expect(f.messages.at(-1)?.ok).toBe(true);
  expect(f.pages()).toEqual([
    { path: other.path, body: "Other edits" },
    { path: first.path, body: next.body },
  ]);
  expect(f.worker.readPendingSyncChanges(f.db)).toContainEqual(
    expect.objectContaining({
      noteId: f.pending.noteId,
      path: first.path,
      body: next.body,
    }),
  );
  expect(
    f.sqlite.prepare("SELECT target_path FROM links WHERE source_path = ?").all(first.path),
  ).toEqual([{ target_path: "/pages/new" }]);
  expect(
    f.sqlite.prepare("SELECT hash FROM bundled_doc_revisions WHERE path = ?").get(first.path),
  ).toEqual({ hash: next.hash });
});

it("未作成ページの元データを記録し、初回作成後の編集を保持する", () => {
  const f = createWorker();
  const doc = bundledDoc("Bundled", "/pages/new");
  f.worker.handleRefreshBundledDocs(f.db, 4, [doc]);
  expect(f.pages()).not.toContainEqual(expect.objectContaining({ path: doc.path }));
  f.save(doc.body, doc.path);
  f.save("My edits", doc.path);
  f.worker.handleRefreshBundledDocs(f.db, 5, [doc]);
  expect(f.pages()).toContainEqual({ path: doc.path, body: "My edits" });
});

it("ハッシュがない既存ページに現在の同梱の本文を一度だけ適用する", () => {
  const f = createWorker();
  const doc = bundledDoc("Current repo [[current]]");
  f.save("Old body [[old]]");
  f.worker.handleRefreshBundledDocs(f.db, 4, [doc]);
  expect(f.pages()).toEqual([{ path: doc.path, body: doc.body }]);
  expect(f.worker.readPendingSyncChanges(f.db)).toContainEqual(
    expect.objectContaining({
      noteId: f.pending.noteId,
      path: doc.path,
      body: doc.body,
    }),
  );
  expect(f.sqlite.prepare("SELECT target_path FROM links").all()).toEqual([
    { target_path: "/pages/current" },
  ]);
  expect(f.sqlite.prepare("SELECT hash FROM bundled_doc_revisions").get()).toEqual({
    hash: doc.hash,
  });
  f.save("Later edit");
  f.worker.handleRefreshBundledDocs(f.db, 5, [doc]);
  expect(f.pages()).toEqual([{ path: doc.path, body: "Later edit" }]);
});

it.each([
  false,
  true,
])("ノートとバックリンクと未送信の変更とハッシュをまとめてロールバックし、再試行できる（ハッシュ記録済み: %s）", (recorded) => {
  const f = createWorker();
  const first = bundledDoc("First [[old]]");
  f.save(first.body);
  if (recorded) f.worker.handleRefreshBundledDocs(f.db, 4, [first]);
  const pending = f.worker.readPendingSyncChanges(f.db);
  const next = bundledDoc("Next [[new]]");
  const failingDb: Db = {
    exec(options) {
      if (options.sql.startsWith("INSERT INTO bundled_doc_revisions")) throw new Error("Disk full");
      f.db.exec(options);
    },
  };
  f.worker.handleRefreshBundledDocs(failingDb, 5, [next]);
  expect(f.messages.at(-1)).toMatchObject({ ok: false, error: "Disk full" });
  expect(f.pages()).toEqual([{ path: first.path, body: first.body }]);
  expect(f.worker.readPendingSyncChanges(f.db)).toEqual(pending);
  expect(f.sqlite.prepare("SELECT target_path FROM links").all()).toEqual([
    { target_path: "/pages/old" },
  ]);
  expect(f.sqlite.prepare("SELECT hash FROM bundled_doc_revisions").get()).toEqual(
    recorded ? { hash: first.hash } : undefined,
  );
  f.worker.handleRefreshBundledDocs(f.db, 6, [next]);
  expect(f.messages.at(-1)?.ok).toBe(true);
  expect(f.pages()).toEqual([{ path: first.path, body: next.body }]);
});

it("削除済みページを復元せず、同梱対象から外れたページも削除しない", () => {
  const f = createWorker();
  const first = bundledDoc("First");
  const other = bundledDoc("Other", "/pages/other");
  f.save(other.body, other.path);
  f.worker.handleRefreshBundledDocs(f.db, 4, [first, other]);
  f.worker.handleDeleteNote(f.db, 5, { path: first.path });
  f.worker.handleRefreshBundledDocs(f.db, 6, [bundledDoc("Next")]);
  expect(f.pages()).toEqual([{ path: other.path, body: other.body }]);
});
