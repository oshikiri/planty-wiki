import { authenticationError, jsonResponse } from "./http";
import type { ChangeRow, SyncContext } from "./types";
import { ensureSyncSchema } from "./schema";
import { parseNonNegativeInteger } from "./validation";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

export async function onRequestGet(context: SyncContext): Promise<Response> {
  const authenticationResponse = authenticationError(context.request);
  if (authenticationResponse) {
    return authenticationResponse;
  }

  if (!context.env.DB) {
    return jsonResponse({ error: "storage_unavailable" }, 503);
  }

  const query = new URL(context.request.url).searchParams;
  const afterResult = query.has("after") ? parseNonNegativeInteger(query.get("after"), "after") : 0;
  const limitResult = query.has("limit")
    ? parseNonNegativeInteger(query.get("limit"), "limit")
    : DEFAULT_LIMIT;

  if (typeof afterResult !== "number") {
    return jsonResponse(afterResult, 400);
  }
  if (typeof limitResult !== "number" || limitResult < 1 || limitResult > MAX_LIMIT) {
    return jsonResponse({ error: "invalid_request", field: "limit" }, 400);
  }

  try {
    await ensureSyncSchema(context.env.DB);
    const result = await context.env.DB.prepare(
      `SELECT change_sequence, note_id, version, kind, path, title, body, deleted_at, updated_at
         FROM changes
         WHERE change_sequence > ?
         ORDER BY change_sequence ASC
         LIMIT ?`,
    )
      .bind(afterResult, limitResult + 1)
      .all<ChangeRow>();
    const hasMore = result.results.length > limitResult;
    const rows = hasMore ? result.results.slice(0, limitResult) : result.results;
    const changes = rows.map(toChangeResponse);
    const nextAfter = rows.at(-1)?.change_sequence ?? afterResult;

    return jsonResponse({ changes, nextAfter, hasMore }, 200);
  } catch {
    return jsonResponse({ error: "storage_unavailable" }, 503);
  }
}

function toChangeResponse(row: ChangeRow) {
  if (row.kind === "delete") {
    return {
      changeSequence: row.change_sequence,
      noteId: row.note_id,
      version: row.version,
      kind: row.kind,
      deletedAt: row.deleted_at,
      updatedAt: row.updated_at,
    };
  }

  return {
    changeSequence: row.change_sequence,
    noteId: row.note_id,
    version: row.version,
    kind: row.kind,
    path: row.path,
    title: row.title,
    body: row.body,
    updatedAt: row.updated_at,
  };
}
