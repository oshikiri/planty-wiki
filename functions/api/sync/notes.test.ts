import { expect, it } from "vitest";

import { onRequestGet } from "./changes";
import { onRequestPut } from "./notes/[noteId]";
import type {
  ChangeRow,
  D1PreparedStatement,
  D1Result,
  NoteRow,
  OperationRow,
  SyncContext,
} from "./types";

const NOTE_ID = "550e8400-e29b-41d4-a716-446655440000";
const OPERATION_ID_1 = "650e8400-e29b-41d4-a716-446655440000";
const OPERATION_ID_2 = "650e8400-e29b-41d4-a716-446655440001";
const OPERATION_ID_3 = "650e8400-e29b-41d4-a716-446655440002";

it("ノートを保存し、同じ操作を再送して、変更を取得できる", async () => {
  const database = new FakeSyncDatabase();
  const body = {
    path: "/pages/README",
    title: "README",
    body: "# README",
    deleted: false,
    operationId: OPERATION_ID_1,
    baseVersion: 0,
  };
  const firstResponse = await putNote(database, body);

  expect(firstResponse.status).toBe(200);
  await expect(firstResponse.json()).resolves.toEqual(successResponse(OPERATION_ID_1));

  const replayResponse = await putNote(database, body);
  expect(replayResponse.status).toBe(200);
  await expect(replayResponse.json()).resolves.toEqual(successResponse(OPERATION_ID_1));

  const changesResponse = await onRequestGet(createChangesContext(database, "?after=0"));
  expect(changesResponse.status).toBe(200);
  await expect(changesResponse.json()).resolves.toEqual({
    changes: [
      {
        changeSequence: 1,
        noteId: NOTE_ID,
        version: 1,
        kind: "upsert",
        path: "/pages/README",
        title: "README",
        body: "# README",
        updatedAt: expect.any(String),
      },
    ],
    nextAfter: 1,
    hasMore: false,
  });
});

it("現在の版からノートを更新し、古い版を拒否する", async () => {
  const database = new FakeSyncDatabase();
  await putNote(database, {
    path: "/pages/README",
    title: "README",
    body: "# README",
    deleted: false,
    operationId: OPERATION_ID_1,
    baseVersion: 0,
  });

  const updateResponse = await putNote(database, {
    path: "/pages/README",
    title: "README",
    body: "# Updated",
    deleted: false,
    operationId: OPERATION_ID_2,
    baseVersion: 1,
  });
  expect(updateResponse.status).toBe(200);
  await expect(updateResponse.json()).resolves.toMatchObject({ version: 2, changeSequence: 2 });

  const staleResponse = await putNote(database, {
    path: "/pages/README",
    title: "README",
    body: "# Stale",
    deleted: false,
    operationId: "650e8400-e29b-41d4-a716-446655440002",
    baseVersion: 1,
  });
  expect(staleResponse.status).toBe(409);
  await expect(staleResponse.json()).resolves.toMatchObject({
    error: "conflict",
    note: { version: 2, body: "# Updated" },
  });
});

it("ノートのメタデータを保持したまま削除を変更として記録する", async () => {
  const database = new FakeSyncDatabase();
  await putNote(database, {
    path: "/pages/README",
    title: "README",
    body: "# README",
    deleted: false,
    operationId: OPERATION_ID_1,
    baseVersion: 0,
  });

  const response = await putNote(database, {
    deleted: true,
    operationId: OPERATION_ID_3,
    baseVersion: 1,
  });
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    version: 2,
    changeSequence: 2,
    deleted: true,
  });

  const changesResponse = await onRequestGet(createChangesContext(database, "?after=1"));
  await expect(changesResponse.json()).resolves.toMatchObject({
    changes: [{ changeSequence: 2, kind: "delete", noteId: NOTE_ID, version: 2 }],
    nextAfter: 2,
    hasMore: false,
  });
});

it("異なる内容で同じ操作IDを再利用した場合に拒否する", async () => {
  const database = new FakeSyncDatabase();
  await putNote(database, {
    path: "/pages/README",
    title: "README",
    body: "# README",
    deleted: false,
    operationId: OPERATION_ID_1,
    baseVersion: 0,
  });

  const response = await putNote(database, {
    path: "/pages/README",
    title: "README",
    body: "# Changed payload",
    deleted: false,
    operationId: OPERATION_ID_1,
    baseVersion: 0,
  });
  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toEqual({ error: "operation_id_reuse" });
});

it("認証を要求し、差分取得のクエリーパラメータを検証する", async () => {
  const database = new FakeSyncDatabase();
  const unauthorized = await onRequestGet(createChangesContext(database, "", false));
  expect(unauthorized.status).toBe(401);

  const invalid = await onRequestGet(createChangesContext(database, "?limit=101"));
  expect(invalid.status).toBe(400);
  await expect(invalid.json()).resolves.toEqual({ error: "invalid_request", field: "limit" });
});

function successResponse(operationId: string) {
  return {
    noteId: NOTE_ID,
    version: 1,
    changeSequence: 1,
    deleted: false,
    operationId,
  };
}

async function putNote(
  database: FakeSyncDatabase,
  body: Record<string, unknown>,
): Promise<Response> {
  return onRequestPut({
    request: new Request(`https://example.test/api/sync/notes/${NOTE_ID}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-email": "member@example.com",
      },
      body: JSON.stringify(body),
    }),
    env: { DB: database },
    params: { noteId: NOTE_ID },
  });
}

function createChangesContext(
  database: FakeSyncDatabase,
  search: string,
  authenticated = true,
): SyncContext {
  return {
    request: new Request(`https://example.test/api/sync/changes${search}`, {
      headers: authenticated ? { "oai-authenticated-user-email": "member@example.com" } : {},
    }),
    env: { DB: database },
  };
}

class FakeSyncDatabase {
  private readonly notes = new Map<string, NoteRow>();
  private readonly operations = new Map<string, OperationRow>();
  private readonly changes: ChangeRow[] = [];

  prepare(query: string): D1PreparedStatement {
    return new FakePreparedStatement(this, query);
  }

  async batch<T extends D1Result>(statements: D1PreparedStatement[]): Promise<T[]> {
    const [change, note, operation] = statements as FakePreparedStatement[];
    const changeValues = change.values;
    const sequence = this.changes.length + 1;
    const deletedAt = changeValues[6] as string | null;
    this.changes.push({
      change_sequence: sequence,
      note_id: changeValues[0] as string,
      version: changeValues[1] as number,
      kind: changeValues[2] as "upsert" | "delete",
      path: changeValues[3] as string | null,
      title: changeValues[4] as string | null,
      body: changeValues[5] as string | null,
      deleted_at: deletedAt,
      updated_at: changeValues[7] as string,
    });

    const noteValues = note.values;
    const savedNote: NoteRow = {
      note_id: noteValues[0] as string,
      path: noteValues[1] as string,
      title: noteValues[2] as string,
      body: noteValues[3] as string,
      version: noteValues[4] as number,
      change_sequence: sequence,
      deleted_at: noteValues[7] as string | null,
      updated_at: noteValues[8] as string,
    };
    this.notes.set(savedNote.note_id, savedNote);

    const operationValues = operation.values;
    const response = JSON.stringify({
      noteId: savedNote.note_id,
      version: savedNote.version,
      changeSequence: savedNote.change_sequence,
      deleted: savedNote.deleted_at !== null,
      operationId: operationValues[0],
    });
    this.operations.set(operationValues[0] as string, {
      note_id: savedNote.note_id,
      request_hash: operationValues[1] as string,
      response,
    });
    return [] as T[];
  }

  findOperation(operationId: string): OperationRow | null {
    return this.operations.get(operationId) ?? null;
  }

  findNote(noteId: string): NoteRow | null {
    return this.notes.get(noteId) ?? null;
  }

  findNoteByPath(path: string, excludedNoteId: string): { note_id: string } | null {
    for (const note of this.notes.values()) {
      if (note.path === path && note.note_id !== excludedNoteId) {
        return { note_id: note.note_id };
      }
    }
    return null;
  }

  findChanges(after: number, limit: number): ChangeRow[] {
    return this.changes.filter((change) => change.change_sequence > after).slice(0, limit);
  }
}

class FakePreparedStatement implements D1PreparedStatement {
  values: unknown[] = [];

  constructor(
    private readonly database: FakeSyncDatabase,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.query.includes("FROM operations")) {
      return this.database.findOperation(this.values[0] as string) as T | null;
    }
    if (this.query.includes("FROM notes WHERE note_id")) {
      return this.database.findNote(this.values[0] as string) as T | null;
    }
    if (this.query.includes("FROM notes WHERE path")) {
      return this.database.findNoteByPath(
        this.values[0] as string,
        this.values[1] as string,
      ) as T | null;
    }
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return {
      results: this.database.findChanges(this.values[0] as number, this.values[1] as number) as T[],
    };
  }

  async run(): Promise<D1Result> {
    return {};
  }
}
