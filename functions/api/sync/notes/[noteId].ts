import { authenticationError, jsonResponse } from "../http";
import type { NoteRow, OperationRow, SyncContext } from "../types";
import { type NoteMutation, parseNoteMutation } from "../validation";

type StoredResponse = {
  noteId: string;
  version: number;
  changeSequence: number;
  deleted: boolean;
  operationId: string;
};

export async function onRequestPut(context: SyncContext): Promise<Response> {
  const authenticationResponse = authenticationError(context.request);
  if (authenticationResponse) {
    return authenticationResponse;
  }

  if (!context.env.DB) {
    return jsonResponse({ error: "storage_unavailable" }, 503);
  }

  const payload = await readJson(context.request);
  if (!payload.ok) {
    return jsonResponse({ error: "invalid_request", field: "body" }, 400);
  }

  const mutation = parseNoteMutation(context.params?.noteId, payload.value);
  if (!isMutation(mutation)) {
    return jsonResponse(mutation, 400);
  }

  try {
    const requestHash = await hashMutation(mutation);
    const existingOperation = await findOperation(context, mutation.operationId);
    if (existingOperation) {
      return replayOrRejectOperation(existingOperation, mutation, requestHash);
    }

    const currentNote = await findNote(context, mutation.noteId);
    const currentVersion = currentNote?.version ?? 0;
    if (mutation.baseVersion !== currentVersion) {
      return conflictResponse(currentNote);
    }

    if (mutation.deleted && !currentNote) {
      return conflictResponse(null);
    }

    if (!mutation.deleted && (await pathBelongsToAnotherNote(context, mutation))) {
      return jsonResponse({ error: "path_conflict" }, 409);
    }

    try {
      await saveMutation(context, mutation, requestHash, currentNote);
    } catch {
      const operationAfterFailure = await findOperation(context, mutation.operationId);
      if (operationAfterFailure) {
        return replayOrRejectOperation(operationAfterFailure, mutation, requestHash);
      }
      return jsonResponse({ error: "storage_unavailable" }, 503);
    }

    const savedOperation = await findOperation(context, mutation.operationId);
    if (!savedOperation) {
      return jsonResponse({ error: "storage_unavailable" }, 503);
    }

    return jsonResponse(JSON.parse(savedOperation.response) as StoredResponse, 200);
  } catch {
    return jsonResponse({ error: "storage_unavailable" }, 503);
  }
}

async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}

function isMutation(value: NoteMutation | { error: string; field: string }): value is NoteMutation {
  return !("error" in value);
}

async function hashMutation(mutation: NoteMutation): Promise<string> {
  const canonical = JSON.stringify(mutation);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function findOperation(
  context: SyncContext,
  operationId: string,
): Promise<OperationRow | null> {
  return (
    context.env.DB?.prepare(
      "SELECT note_id, request_hash, response FROM operations WHERE operation_id = ?",
    )
      .bind(operationId)
      .first<OperationRow>() ?? null
  );
}

async function findNote(context: SyncContext, noteId: string): Promise<NoteRow | null> {
  return (
    context.env.DB?.prepare(
      "SELECT note_id, path, title, body, version, change_sequence, deleted_at, updated_at FROM notes WHERE note_id = ?",
    )
      .bind(noteId)
      .first<NoteRow>() ?? null
  );
}

function replayOrRejectOperation(
  operation: OperationRow,
  mutation: NoteMutation,
  requestHash: string,
): Response {
  if (operation.note_id !== mutation.noteId || operation.request_hash !== requestHash) {
    return jsonResponse({ error: "operation_id_reuse" }, 409);
  }

  return new Response(operation.response, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function conflictResponse(note: NoteRow | null): Response {
  if (!note) {
    return jsonResponse({ error: "conflict", note: null }, 409);
  }

  return jsonResponse(
    {
      error: "conflict",
      note: {
        noteId: note.note_id,
        version: note.version,
        changeSequence: note.change_sequence,
        path: note.path,
        title: note.title,
        body: note.body,
        deleted: note.deleted_at !== null,
        updatedAt: note.updated_at,
      },
    },
    409,
  );
}

async function pathBelongsToAnotherNote(
  context: SyncContext,
  mutation: NoteMutation,
): Promise<boolean> {
  const row = await context.env.DB?.prepare(
    "SELECT note_id FROM notes WHERE path = ? AND note_id <> ?",
  )
    .bind(mutation.path, mutation.noteId)
    .first<{ note_id: string }>();
  return Boolean(row);
}

async function saveMutation(
  context: SyncContext,
  mutation: NoteMutation,
  requestHash: string,
  currentNote: NoteRow | null,
): Promise<void> {
  const db = context.env.DB;
  if (!db) {
    throw new Error("D1 is not bound");
  }

  const updatedAt = new Date().toISOString();
  const version = (currentNote?.version ?? 0) + 1;
  const changeStatement = db
    .prepare(
      "INSERT INTO changes (note_id, version, kind, path, title, body, deleted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      mutation.noteId,
      version,
      mutation.deleted ? "delete" : "upsert",
      mutation.deleted ? null : mutation.path,
      mutation.deleted ? null : mutation.title,
      mutation.deleted ? null : mutation.body,
      mutation.deleted ? updatedAt : null,
      updatedAt,
    );
  const noteStatement = db
    .prepare(
      `INSERT INTO notes (note_id, path, title, body, version, change_sequence, deleted_at, updated_at)
       VALUES (?, ?, ?, ?, ?,
         (SELECT change_sequence FROM changes WHERE note_id = ? AND version = ? ORDER BY change_sequence DESC LIMIT 1),
         ?, ?)
       ON CONFLICT(note_id) DO UPDATE SET
         path = excluded.path,
         title = excluded.title,
         body = excluded.body,
         version = excluded.version,
         change_sequence = excluded.change_sequence,
         deleted_at = excluded.deleted_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      mutation.noteId,
      mutation.deleted ? currentNote?.path : mutation.path,
      mutation.deleted ? currentNote?.title : mutation.title,
      mutation.deleted ? currentNote?.body : mutation.body,
      version,
      mutation.noteId,
      version,
      mutation.deleted ? updatedAt : null,
      updatedAt,
    );
  const operationStatement = db
    .prepare(
      `INSERT INTO operations (operation_id, note_id, request_hash, response, created_at)
       SELECT ?, note_id, ?, json_object(
         'noteId', note_id,
         'version', version,
         'changeSequence', change_sequence,
         'deleted', CASE WHEN deleted_at IS NULL THEN json('false') ELSE json('true') END,
         'operationId', ?
       ), ?
       FROM notes WHERE note_id = ?`,
    )
    .bind(mutation.operationId, requestHash, mutation.operationId, updatedAt, mutation.noteId);

  await db.batch([changeStatement, noteStatement, operationStatement]);
}
