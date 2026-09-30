let dbPromise = null;
const cancelledRequestIds = new Set();
const MAX_QUERY_ROWS = 200;
let syncRequest = Promise.resolve();

self.onmessage = async function (event) {
  const data = event.data || {};
  const id = data.id;
  const type = data.type;
  const payload = data.payload;
  if (typeof id !== "number" || typeof type !== "string") {
    return;
  }

  if (type === "cancelRequest") {
    markRequestCancelled(payload && typeof payload.targetId === "number" ? payload.targetId : null);
    return;
  }

  if (isRequestCancelled(id)) {
    // Skip DB work for requests that already timed out on the main thread.
    consumeCancelledRequest(id);
    return;
  }

  try {
    const db = await createOrGetDbPromise();
    if (!db) {
      postIfNotCancelled(id, { id: id, ok: false, error: "SQLite database is not available" });
      return;
    }

    if (type === "loadNoteSummaries") {
      handleLoadNoteSummaries(db, id);
      return;
    }

    if (type === "loadNote") {
      handleLoadNote(db, id, payload);
      return;
    }

    if (type === "loadNotes") {
      handleLoadNotes(db, id);
      return;
    }

    if (type === "saveNote") {
      handleSaveNote(db, id, payload);
      return;
    }

    if (type === "deleteNote") {
      handleDeleteNote(db, id, payload);
      return;
    }

    if (type === "bulkSaveNotes") {
      handleBulkSaveNotes(db, id, payload);
      return;
    }

    if (type === "loadPendingSyncChanges") {
      handleLoadPendingSyncChanges(db, id);
      return;
    }

    if (type === "syncPendingChanges") {
      handleSyncPendingChanges(db, id);
      return;
    }

    if (type === "listBacklinks") {
      handleListBacklinks(db, id, payload);
      return;
    }

    if (type === "runQuery") {
      handleRunQuery(db, id, payload);
      return;
    }

    postIfNotCancelled(id, { id: id, ok: false, error: `Unknown message type: ${type}` });
  } catch (error) {
    postIfNotCancelled(id, {
      id: id,
      ok: false,
      error: error && error.message ? String(error.message) : String(error),
    });
  }
};

function createOrGetDbPromise() {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        importScripts(new URL("sqlite3.js", self.location).toString());
        if (typeof self.sqlite3InitModule !== "function") {
          console.error("sqlite3InitModule is not available in worker");
          return null;
        }
        const sqlite3 = await self.sqlite3InitModule();
        if (!sqlite3 || !sqlite3.oo1 || !sqlite3.oo1.OpfsDb) {
          console.error("sqlite3.oo1.OpfsDb is not available in worker");
          return null;
        }
        const db = new sqlite3.oo1.OpfsDb("notes.v1.db");
        db.exec({ sql: "PRAGMA journal_mode = WAL;" });
        db.exec({
          sql: `
            CREATE TABLE IF NOT EXISTS pages (
              path TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              body TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
          `,
        });
        initializeSyncStructures(db);
        initializeLinkStructures(db);
        return db;
      } catch (error) {
        console.error("Failed to initialize SQLite OPFS database in worker", error);
        return null;
      }
    })();
  }
  return dbPromise;
}

function handleLoadNotes(db, id) {
  var rows = [];
  db.exec({
    sql: "SELECT path, title, body, updated_at AS updatedAt FROM pages ORDER BY path",
    rowMode: "object",
    callback: function (row) {
      if (!row || typeof row !== "object") return;
      rows.push({
        path: String(row.path || ""),
        title: String(row.title || ""),
        body: String(row.body || ""),
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : undefined,
      });
    },
  });
  postIfNotCancelled(id, { id: id, ok: true, result: rows });
}

function handleLoadNoteSummaries(db, id) {
  var rows = [];
  db.exec({
    sql: "SELECT path, title, updated_at AS updatedAt FROM pages ORDER BY path",
    rowMode: "object",
    callback: function (row) {
      if (!row || typeof row !== "object") return;
      rows.push({
        path: String(row.path || ""),
        title: String(row.title || ""),
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : undefined,
      });
    },
  });
  postIfNotCancelled(id, { id: id, ok: true, result: rows });
}

function handleLoadNote(db, id, payload) {
  var path = "";
  if (payload && typeof payload === "object" && typeof payload.path === "string") {
    path = payload.path;
  } else {
    path = String(payload || "");
  }
  if (!path) {
    postIfNotCancelled(id, { id: id, ok: true, result: null });
    return;
  }
  var note = null;
  db.exec({
    sql: "SELECT path, title, body, updated_at AS updatedAt FROM pages WHERE path = $path LIMIT 1",
    rowMode: "object",
    bind: { $path: path },
    callback: function (row) {
      if (!row || typeof row !== "object") return;
      note = {
        path: String(row.path || ""),
        title: String(row.title || ""),
        body: String(row.body || ""),
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : undefined,
      };
    },
  });
  postIfNotCancelled(id, { id: id, ok: true, result: note });
}

function handleSaveNote(db, id, payload) {
  var note = payload || {};
  var now = new Date().toISOString();
  var path = extractAndValidateText(note.path, 512);
  var title = extractAndValidateText(note.title, 1024);
  var body = extractAndValidateText(note.body, 50000, { allowEmpty: true });
  if (!path || !title || body == null) {
    postIfNotCancelled(id, { id: id, ok: false, error: "Invalid note payload" });
    return;
  }
  var updatedAt = typeof note.updatedAt === "string" ? note.updatedAt : now;
  var syncNote = findSyncNoteByPath(db, path);
  var noteId = syncNote ? syncNote.noteId : createSyncNoteId();
  var baseVersion = syncNote ? syncNote.version : 0;
  try {
    db.exec({ sql: "BEGIN" });
    db.exec({
      sql:
        "INSERT INTO pages (path, title, body, updated_at) VALUES ($path, $title, $body, $updated_at) " +
        "ON CONFLICT(path) DO UPDATE SET title = excluded.title, body = excluded.body, updated_at = excluded.updated_at",
      bind: {
        $path: path,
        $title: title,
        $body: body,
        $updated_at: updatedAt,
      },
    });
    replaceLinksForSource(db, path, body);
    upsertSyncNote(db, {
      path: path,
      noteId: noteId,
      version: syncNote ? syncNote.version : 0,
      changeSequence: syncNote ? syncNote.changeSequence : 0,
      deleted: false,
      updatedAt: updatedAt,
    });
    enqueueSyncChange(db, {
      operationId: createSyncNoteId(),
      noteId: noteId,
      path: path,
      title: title,
      body: body,
      deleted: false,
      baseVersion: baseVersion,
      createdAt: updatedAt,
    });
    db.exec({ sql: "COMMIT" });
    postIfNotCancelled(id, { id: id, ok: true, result: null });
  } catch (error) {
    rollbackTransaction(db);
    postIfNotCancelled(id, {
      id: id,
      ok: false,
      error: error && error.message ? String(error.message) : "Failed to save note",
    });
  }
}

function extractAndValidateText(value, maxLength, options) {
  const allowEmpty = Boolean(options && options.allowEmpty);
  if (typeof value !== "string") {
    value = value == null ? "" : String(value);
  }
  const trimmed = value.trim();
  if (!trimmed && !allowEmpty) {
    return null;
  }
  if (trimmed.length > maxLength) {
    return null;
  }
  return trimmed;
}

function handleDeleteNote(db, id, payload) {
  var path = "";
  if (payload && typeof payload === "object" && typeof payload.path === "string") {
    path = payload.path;
  } else {
    path = String(payload || "");
  }
  if (!path) {
    postIfNotCancelled(id, { id: id, ok: false, error: "Missing note path for delete" });
    return;
  }
  var page = findPageByPath(db, path);
  if (!page) {
    postIfNotCancelled(id, { id: id, ok: true, result: null });
    return;
  }
  var syncNote = findSyncNoteByPath(db, path);
  var noteId = syncNote ? syncNote.noteId : createSyncNoteId();
  var baseVersion = syncNote ? syncNote.version : 0;
  var now = new Date().toISOString();
  try {
    db.exec({ sql: "BEGIN" });
    db.exec({
      sql: "DELETE FROM pages WHERE path = $path",
      bind: { $path: path },
    });
    db.exec({
      sql: "DELETE FROM links WHERE source_path = $path",
      bind: { $path: path },
    });
    upsertSyncNote(db, {
      path: path,
      noteId: noteId,
      version: syncNote ? syncNote.version : 0,
      changeSequence: syncNote ? syncNote.changeSequence : 0,
      deleted: true,
      updatedAt: now,
    });
    enqueueSyncChange(db, {
      operationId: createSyncNoteId(),
      noteId: noteId,
      path: path,
      title: page.title,
      body: page.body,
      deleted: true,
      baseVersion: baseVersion,
      createdAt: now,
    });
    db.exec({ sql: "COMMIT" });
    postIfNotCancelled(id, { id: id, ok: true, result: null });
  } catch (error) {
    rollbackTransaction(db);
    postIfNotCancelled(id, {
      id: id,
      ok: false,
      error: error && error.message ? String(error.message) : "Failed to delete note",
    });
  }
}

function handleLoadPendingSyncChanges(db, id) {
  postIfNotCancelled(id, { id: id, ok: true, result: readPendingSyncChanges(db) });
}

function readPendingSyncChanges(db) {
  var changes = [];
  db.exec({
    sql:
      "SELECT operation_id, note_id, path, title, body, deleted, base_version, created_at " +
      "FROM sync_outbox ORDER BY created_at ASC, operation_id ASC",
    rowMode: "object",
    callback: function (row) {
      if (!row || typeof row !== "object") return;
      changes.push({
        operationId: String(row.operation_id || ""),
        noteId: String(row.note_id || ""),
        path: String(row.path || ""),
        title: String(row.title || ""),
        body: String(row.body || ""),
        deleted: Number(row.deleted) === 1,
        baseVersion: Number(row.base_version || 0),
        createdAt: String(row.created_at || ""),
      });
    },
  });
  return changes;
}

function handleSyncPendingChanges(db, id) {
  syncRequest = syncRequest
    .catch(() => undefined)
    .then(() => runSyncPendingChanges(db))
    .then((result) => {
      postIfNotCancelled(id, { id: id, ok: true, result: result });
    })
    .catch((error) => {
      postIfNotCancelled(id, {
        id: id,
        ok: false,
        error: error && error.message ? String(error.message) : "Cloud Sync failed",
      });
    });
}

async function runSyncPendingChanges(db) {
  var pendingChanges = readPendingSyncChanges(db);
  var syncedChanges = 0;

  for (const change of pendingChanges) {
    const result = await sendPendingSyncChange(change);
    if (result.status !== "synced") {
      return {
        ...result,
        syncedChanges: syncedChanges,
        receivedChanges: 0,
      };
    }

    acknowledgeSyncChange(db, change, result);
    syncedChanges += 1;
  }

  const received = await pullRemoteChanges(db);
  return {
    ...received,
    status: received.status === "idle" && syncedChanges > 0 ? "synced" : received.status,
    syncedChanges: syncedChanges,
  };
}

async function sendPendingSyncChange(change) {
  var requestBody = change.deleted
    ? {
        deleted: true,
        operationId: change.operationId,
        baseVersion: change.baseVersion,
      }
    : {
        path: change.path,
        title: change.title,
        body: change.body,
        deleted: false,
        operationId: change.operationId,
        baseVersion: change.baseVersion,
      };

  var response;
  try {
    response = await fetch(
      new URL("/api/sync/notes/" + encodeURIComponent(change.noteId), self.location.origin),
      {
        method: "PUT",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      },
    );
  } catch {
    return { status: "unavailable" };
  }

  if (response.status === 401) {
    return { status: "unauthenticated" };
  }

  var payload = await readResponseJson(response);
  if (response.status === 409) {
    return {
      status: "conflict",
      noteId: change.noteId,
      response: payload,
    };
  }

  if (!response.ok || !isSyncSuccessPayload(payload, change.operationId)) {
    return { status: "unavailable" };
  }

  return {
    status: "synced",
    version: payload.version,
    changeSequence: payload.changeSequence,
  };
}

async function readResponseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isSyncSuccessPayload(value, operationId) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.operationId === operationId &&
      Number.isSafeInteger(value.version) &&
      value.version >= 1 &&
      Number.isSafeInteger(value.changeSequence) &&
      value.changeSequence >= 1,
  );
}

function acknowledgeSyncChange(db, change, result) {
  db.exec({ sql: "BEGIN" });
  try {
    db.exec({
      sql:
        "UPDATE sync_notes SET version = $version, change_sequence = $change_sequence " +
        "WHERE note_id = $note_id",
      bind: {
        $version: result.version,
        $change_sequence: result.changeSequence,
        $note_id: change.noteId,
      },
    });
    db.exec({
      sql:
        "UPDATE sync_outbox SET base_version = $version " +
        "WHERE note_id = $note_id AND operation_id <> $operation_id",
      bind: {
        $version: result.version,
        $note_id: change.noteId,
        $operation_id: change.operationId,
      },
    });
    db.exec({
      sql: "DELETE FROM sync_outbox WHERE operation_id = $operation_id",
      bind: { $operation_id: change.operationId },
    });
    db.exec({ sql: "COMMIT" });
  } catch (error) {
    rollbackTransaction(db);
    throw error;
  }
}


async function pullRemoteChanges(db) {
  var cursor = readSyncCursor(db);
  var receivedChanges = 0;

  while (true) {
    var response;
    try {
      response = await fetch(
        new URL("/api/sync/changes?after=" + cursor + "&limit=100", self.location.origin),
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        },
      );
    } catch {
      return {
        status: "unavailable",
        syncedChanges: 0,
        receivedChanges: receivedChanges,
      };
    }

    if (response.status === 401) {
      return {
        status: "unauthenticated",
        syncedChanges: 0,
        receivedChanges: receivedChanges,
      };
    }

    var payload = await readResponseJson(response);
    if (!response.ok || !isChangesPayload(payload, cursor)) {
      return {
        status: "unavailable",
        syncedChanges: 0,
        receivedChanges: receivedChanges,
      };
    }

    var applied = applyRemoteChanges(db, payload.changes, cursor);
    receivedChanges += applied.receivedChanges;
    cursor = applied.nextAfter;

    if (applied.status !== "synced") {
      return {
        ...applied,
        syncedChanges: 0,
        receivedChanges: receivedChanges,
      };
    }

    if (!payload.hasMore) {
      return {
        status: receivedChanges > 0 ? "synced" : "idle",
        syncedChanges: 0,
        receivedChanges: receivedChanges,
      };
    }
  }
}

function isChangesPayload(value, cursor) {
  const nextAfterIsValid =
    value?.hasMore === true ? value.nextAfter > cursor : value.nextAfter >= cursor;
  const hasRowsWhenMore =
    value?.hasMore !== true || (Array.isArray(value?.changes) && value.changes.length > 0);
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray(value.changes) &&
      Number.isSafeInteger(value.nextAfter) &&
      nextAfterIsValid &&
      hasRowsWhenMore &&
      typeof value.hasMore === "boolean",
  );
}

function applyRemoteChanges(db, changes, cursor) {
  var receivedChanges = 0;
  var nextAfter = cursor;
  db.exec({ sql: "BEGIN" });
  try {
    for (const change of changes) {
      if (!isRemoteChange(change, nextAfter)) {
        throw new Error("Invalid Cloud Sync change");
      }

      if (hasPendingSyncChange(db, change.noteId)) {
        if (nextAfter !== cursor) {
          writeSyncCursor(db, nextAfter);
        }
        db.exec({ sql: "COMMIT" });
        return {
          status: "deferred",
          nextAfter: nextAfter,
          receivedChanges: receivedChanges,
        };
      }

      if (isAlreadyAppliedChange(db, change)) {
        nextAfter = change.changeSequence;
        continue;
      }

      const conflict = applyRemoteChange(db, change);
      if (conflict) {
        rollbackTransaction(db);
        return {
          status: "conflict",
          noteId: change.noteId,
          response: conflict,
          nextAfter: nextAfter,
          receivedChanges: receivedChanges,
        };
      }

      nextAfter = change.changeSequence;
      receivedChanges += 1;
    }

    if (nextAfter !== cursor) {
      writeSyncCursor(db, nextAfter);
    }
    db.exec({ sql: "COMMIT" });
    return {
      status: "synced",
      nextAfter: nextAfter,
      receivedChanges: receivedChanges,
    };
  } catch (error) {
    rollbackTransaction(db);
    throw error;
  }
}

function isRemoteChange(change, previousSequence) {
  return Boolean(
    change &&
      typeof change === "object" &&
      Number.isSafeInteger(change.changeSequence) &&
      change.changeSequence > previousSequence &&
      typeof change.noteId === "string" &&
      Number.isSafeInteger(change.version) &&
      change.version >= 1 &&
      typeof change.updatedAt === "string" &&
      (change.kind === "upsert" || change.kind === "delete"),
  );
}

function hasPendingSyncChange(db, noteId) {
  var pending = null;
  db.exec({
    sql: "SELECT operation_id FROM sync_outbox WHERE note_id = $note_id LIMIT 1",
    rowMode: "object",
    bind: { $note_id: noteId },
    callback: function (row) {
      if (row && typeof row === "object") {
        pending = row;
      }
    },
  });
  return Boolean(pending);
}

function isAlreadyAppliedChange(db, change) {
  var syncNote = findSyncNoteById(db, change.noteId);
  if (syncNote && syncNote.changeSequence >= change.changeSequence) {
    return true;
  }

  var deletedNote = findDeletedSyncNote(db, change.noteId);
  return Boolean(deletedNote && deletedNote.changeSequence >= change.changeSequence);
}

function applyRemoteChange(db, change) {
  if (change.kind === "delete") {
    return applyRemoteDelete(db, change);
  }
  return applyRemoteUpsert(db, change);
}

function applyRemoteUpsert(db, change) {
  if (
    typeof change.path !== "string" ||
    typeof change.title !== "string" ||
    typeof change.body !== "string" ||
    typeof change.updatedAt !== "string"
  ) {
    return { error: "invalid_remote_change", noteId: change.noteId };
  }

  var pathConflict = findSyncNoteByPath(db, change.path);
  if (pathConflict && pathConflict.noteId !== change.noteId) {
    return { error: "path_conflict", noteId: change.noteId, path: change.path };
  }

  var current = findSyncNoteById(db, change.noteId);
  if (current && current.path !== change.path) {
    db.exec({
      sql: "DELETE FROM pages WHERE path = $path",
      bind: { $path: current.path },
    });
    db.exec({
      sql: "DELETE FROM links WHERE source_path = $path",
      bind: { $path: current.path },
    });
    db.exec({
      sql: "DELETE FROM sync_notes WHERE path = $path",
      bind: { $path: current.path },
    });
  }

  db.exec({
    sql:
      "INSERT INTO pages (path, title, body, updated_at) VALUES ($path, $title, $body, $updated_at) " +
      "ON CONFLICT(path) DO UPDATE SET title = excluded.title, body = excluded.body, " +
      "updated_at = excluded.updated_at",
    bind: {
      $path: change.path,
      $title: change.title,
      $body: change.body,
      $updated_at: change.updatedAt,
    },
  });
  replaceLinksForSource(db, change.path, change.body);
  upsertSyncNote(db, {
    path: change.path,
    noteId: change.noteId,
    version: change.version,
    changeSequence: change.changeSequence,
    deleted: false,
    updatedAt: change.updatedAt,
  });
  db.exec({
    sql: "DELETE FROM sync_deleted_notes WHERE note_id = $note_id",
    bind: { $note_id: change.noteId },
  });
  return null;
}

function applyRemoteDelete(db, change) {
  var current = findSyncNoteById(db, change.noteId);
  if (current) {
    db.exec({
      sql: "DELETE FROM pages WHERE path = $path",
      bind: { $path: current.path },
    });
    db.exec({
      sql: "DELETE FROM links WHERE source_path = $path",
      bind: { $path: current.path },
    });
    upsertSyncNote(db, {
      path: current.path,
      noteId: change.noteId,
      version: change.version,
      changeSequence: change.changeSequence,
      deleted: true,
      updatedAt: change.updatedAt,
    });
    return null;
  }

  db.exec({
    sql:
      "INSERT INTO sync_deleted_notes " +
      "(note_id, version, change_sequence, deleted_at, updated_at) " +
      "VALUES ($note_id, $version, $change_sequence, $deleted_at, $updated_at) " +
      "ON CONFLICT(note_id) DO UPDATE SET version = excluded.version, " +
      "change_sequence = excluded.change_sequence, deleted_at = excluded.deleted_at, " +
      "updated_at = excluded.updated_at",
    bind: {
      $note_id: change.noteId,
      $version: change.version,
      $change_sequence: change.changeSequence,
      $deleted_at: typeof change.deletedAt === "string" ? change.deletedAt : null,
      $updated_at: change.updatedAt,
    },
  });
  return null;
}

function readSyncCursor(db) {
  var cursor = 0;
  db.exec({
    sql: "SELECT state_value FROM sync_state WHERE state_key = 'change_sequence' LIMIT 1",
    rowMode: "object",
    callback: function (row) {
      if (row && typeof row === "object") {
        cursor = Number(row.state_value || 0);
      }
    },
  });
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
}

function writeSyncCursor(db, cursor) {
  db.exec({
    sql:
      "INSERT INTO sync_state (state_key, state_value) VALUES ('change_sequence', $value) " +
      "ON CONFLICT(state_key) DO UPDATE SET state_value = excluded.state_value",
    bind: { $value: cursor },
  });
}

function findSyncNoteById(db, noteId) {
  var syncNote = null;
  db.exec({
    sql:
      "SELECT path, note_id, version, change_sequence, deleted, updated_at " +
      "FROM sync_notes WHERE note_id = $note_id LIMIT 1",
    rowMode: "object",
    bind: { $note_id: noteId },
    callback: function (row) {
      if (!row || typeof row !== "object") return;
      syncNote = {
        path: String(row.path || ""),
        noteId: String(row.note_id || ""),
        version: Number(row.version || 0),
        changeSequence: Number(row.change_sequence || 0),
        deleted: Number(row.deleted) === 1,
        updatedAt: String(row.updated_at || ""),
      };
    },
  });
  return syncNote;
}

function findDeletedSyncNote(db, noteId) {
  var deletedNote = null;
  db.exec({
    sql:
      "SELECT note_id, version, change_sequence, deleted_at, updated_at " +
      "FROM sync_deleted_notes WHERE note_id = $note_id LIMIT 1",
    rowMode: "object",
    bind: { $note_id: noteId },
    callback: function (row) {
      if (!row || typeof row !== "object") return;
      deletedNote = {
        noteId: String(row.note_id || ""),
        version: Number(row.version || 0),
        changeSequence: Number(row.change_sequence || 0),
        deletedAt: row.deleted_at === null ? null : String(row.deleted_at || ""),
        updatedAt: String(row.updated_at || ""),
      };
    },
  });
  return deletedNote;
}

function findPageByPath(db, path) {
  var page = null;
  db.exec({
    sql: "SELECT path, title, body FROM pages WHERE path = $path LIMIT 1",
    rowMode: "object",
    bind: { $path: path },
    callback: function (row) {
      if (!row || typeof row !== "object") return;
      page = {
        path: String(row.path || ""),
        title: String(row.title || ""),
        body: String(row.body || ""),
      };
    },
  });
  return page;
}

function findSyncNoteByPath(db, path) {
  var syncNote = null;
  db.exec({
    sql:
      "SELECT path, note_id, version, change_sequence, deleted, updated_at " +
      "FROM sync_notes WHERE path = $path LIMIT 1",
    rowMode: "object",
    bind: { $path: path },
    callback: function (row) {
      if (!row || typeof row !== "object") return;
      syncNote = {
        path: String(row.path || ""),
        noteId: String(row.note_id || ""),
        version: Number(row.version || 0),
        changeSequence: Number(row.change_sequence || 0),
        deleted: Number(row.deleted) === 1,
        updatedAt: String(row.updated_at || ""),
      };
    },
  });
  return syncNote;
}

function upsertSyncNote(db, syncNote) {
  db.exec({
    sql:
      "INSERT INTO sync_notes (path, note_id, version, change_sequence, deleted, updated_at) " +
      "VALUES ($path, $note_id, $version, $change_sequence, $deleted, $updated_at) " +
      "ON CONFLICT(path) DO UPDATE SET " +
      "note_id = excluded.note_id, version = excluded.version, " +
      "change_sequence = excluded.change_sequence, deleted = excluded.deleted, " +
      "updated_at = excluded.updated_at",
    bind: {
      $path: syncNote.path,
      $note_id: syncNote.noteId,
      $version: syncNote.version,
      $change_sequence: syncNote.changeSequence,
      $deleted: syncNote.deleted ? 1 : 0,
      $updated_at: syncNote.updatedAt,
    },
  });
}

function enqueueSyncChange(db, change) {
  db.exec({
    sql:
      "INSERT INTO sync_outbox " +
      "(operation_id, note_id, path, title, body, deleted, base_version, created_at) " +
      "VALUES ($operation_id, $note_id, $path, $title, $body, $deleted, $base_version, $created_at) " +
      "ON CONFLICT(note_id) DO UPDATE SET " +
      "operation_id = excluded.operation_id, path = excluded.path, " +
      "title = excluded.title, body = excluded.body, deleted = excluded.deleted, " +
      "base_version = sync_outbox.base_version, created_at = excluded.created_at",
    bind: {
      $operation_id: change.operationId,
      $note_id: change.noteId,
      $path: change.path,
      $title: change.title,
      $body: change.body,
      $deleted: change.deleted ? 1 : 0,
      $base_version: change.baseVersion,
      $created_at: change.createdAt,
    },
  });
}

function createSyncNoteId() {
  if (!self.crypto || typeof self.crypto.randomUUID !== "function") {
    throw new Error("Secure UUID generation is unavailable");
  }
  return self.crypto.randomUUID();
}

function rollbackTransaction(db) {
  try {
    db.exec({ sql: "ROLLBACK" });
  } catch (rollbackError) {
    console.error("Failed to rollback note transaction", rollbackError);
  }
}


function handleBulkSaveNotes(db, id, payload) {
  const notes = Array.isArray(payload) ? payload : [];
  const nowForBulk = new Date().toISOString();
  db.exec({ sql: "BEGIN" });
  try {
    db.exec({ sql: "DELETE FROM pages" });
    db.exec({ sql: "DELETE FROM links" });
    for (let index = 0; index < notes.length; index++) {
      const sanitized = sanitizeNoteForImport(notes[index], nowForBulk, index);
      db.exec({
        sql:
          "INSERT INTO pages (path, title, body, updated_at) VALUES ($path, $title, $body, $updated_at) " +
          "ON CONFLICT(path) DO UPDATE SET title = excluded.title, body = excluded.body, updated_at = excluded.updated_at",
        bind: {
          $path: sanitized.path,
          $title: sanitized.title,
          $body: sanitized.body,
          $updated_at: sanitized.updatedAt,
        },
      });
      insertLinksForSource(db, sanitized.path, sanitized.body);
    }
    db.exec({ sql: "COMMIT" });
    postIfNotCancelled(id, { id: id, ok: true, result: null });
  } catch (error) {
    try {
      db.exec({ sql: "ROLLBACK" });
    } catch (rollbackError) {
      console.error("Failed to rollback bulk import", rollbackError);
    }
    postIfNotCancelled(id, {
      id: id,
      ok: false,
      error: error && error.message ? String(error.message) : "Failed to import notes",
    });
  }
}

function sanitizeNoteForImport(note, fallbackUpdatedAt, index) {
  const record = note || {};
  const path = extractAndValidateText(record.path, 512);
  const title = extractAndValidateText(record.title, 1024);
  const body = extractAndValidateText(record.body, 50000, { allowEmpty: true });
  if (!path || !title || body == null) {
    // Include the index in the error so corrupted data is easy to identify during import.
    throw new Error(`Invalid note payload during import (index ${index})`);
  }
  const updatedAt =
    typeof record.updatedAt === "string" && record.updatedAt.trim()
      ? record.updatedAt
      : fallbackUpdatedAt;
  return { path, title, body, updatedAt };
}

function normalizeWikiLabelToPath(label) {
  const trimmed = String(label || "").trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed[0] === "/") {
    if (trimmed.slice(0, 7) === "/pages/") {
      return trimmed;
    }
    return "/pages/" + trimmed.replace(/^\/+/, "");
  }
  return "/pages/" + trimmed;
}

function handleListBacklinks(db, id, payload) {
  var targetPath = "";
  if (payload && typeof payload === "object" && typeof payload.path === "string") {
    targetPath = payload.path.trim();
  } else if (typeof payload === "string") {
    targetPath = payload.trim();
  }
  if (!targetPath) {
    postIfNotCancelled(id, { id: id, ok: true, result: [] });
    return;
  }
  var rows = [];
  db.exec({
    sql: `
      SELECT p.path AS path, p.title AS title, p.body AS body, p.updated_at AS updatedAt
      FROM links AS l
      JOIN pages AS p ON p.path = l.source_path
      WHERE l.target_path = $target
      GROUP BY p.path
      ORDER BY p.updated_at DESC
      LIMIT 100
    `,
    bind: { $target: targetPath },
    rowMode: "object",
    callback: function (row) {
      if (!row || typeof row !== "object") return;
      rows.push({
        path: String(row.path || ""),
        title: String(row.title || ""),
        body: String(row.body || ""),
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : undefined,
      });
    },
  });
  postIfNotCancelled(id, { id: id, ok: true, result: rows });
}

function handleRunQuery(db, id, payload) {
  var query = "";
  if (payload && typeof payload.query === "string") {
    query = payload.query.trim();
  }
  if (!query) {
    postIfNotCancelled(id, { id: id, ok: false, error: "Query is empty" });
    return;
  }
  var sanitized = stripTrailingSemicolons(query);
  if (sanitized.indexOf(";") !== -1) {
    postIfNotCancelled(id, { id: id, ok: false, error: "Only a single query is supported" });
    return;
  }
  if (!isSelectQuery(sanitized)) {
    postIfNotCancelled(id, { id: id, ok: false, error: "Only SELECT queries are supported" });
    return;
  }
  var rows = [];
  var columns = [];
  try {
    db.exec({
      sql: sanitized,
      rowMode: "object",
      callback: function (row) {
        if (!row || typeof row !== "object") return;
        if (columns.length === 0) {
          columns = Object.keys(row);
        }
        if (rows.length <= MAX_QUERY_ROWS) {
          rows.push(columns.map(function (column) {
            return row[column];
          }));
        }
      },
    });
    var truncated = rows.length > MAX_QUERY_ROWS;
    if (truncated) {
      rows = rows.slice(0, MAX_QUERY_ROWS);
    }
    postIfNotCancelled(id, {
      id: id,
      ok: true,
      result: { columns: columns, rows: rows, truncated: truncated },
    });
  } catch (error) {
    postIfNotCancelled(id, {
      id: id,
      ok: false,
      error: error && error.message ? String(error.message) : String(error),
    });
  }
}

function stripTrailingSemicolons(text) {
  return String(text || "").replace(/;+\s*$/, "");
}

function isSelectQuery(text) {
  var normalized = String(text || "").trim().toLowerCase();
  return normalized.indexOf("select") === 0 || normalized.indexOf("with") === 0;
}

function initializeSyncStructures(db) {
  db.exec({
    sql:
      "CREATE TABLE IF NOT EXISTS sync_notes (" +
      "path TEXT PRIMARY KEY, note_id TEXT NOT NULL UNIQUE, " +
      "version INTEGER NOT NULL DEFAULT 0, change_sequence INTEGER NOT NULL DEFAULT 0, " +
      "deleted INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)",
  });
  db.exec({
    sql:
      "CREATE TABLE IF NOT EXISTS sync_outbox (" +
      "operation_id TEXT PRIMARY KEY, note_id TEXT NOT NULL, path TEXT NOT NULL, " +
      "title TEXT NOT NULL, body TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, " +
      "base_version INTEGER NOT NULL, created_at TEXT NOT NULL)",
  });
  db.exec({
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS sync_outbox_note_id_idx ON sync_outbox(note_id)",
  });
  db.exec({
    sql:
      "CREATE TABLE IF NOT EXISTS sync_deleted_notes (" +
      "note_id TEXT PRIMARY KEY, version INTEGER NOT NULL, " +
      "change_sequence INTEGER NOT NULL, deleted_at TEXT, updated_at TEXT NOT NULL)",
  });
  db.exec({
    sql:
      "CREATE TABLE IF NOT EXISTS sync_state (" +
      "state_key TEXT PRIMARY KEY, state_value INTEGER NOT NULL)",
  });
  db.exec({
    sql:
      "INSERT OR IGNORE INTO sync_state (state_key, state_value) " +
      "VALUES ('change_sequence', 0)",
  });
}

function initializeLinkStructures(db) {
  try {
    db.exec({
      sql: `
        CREATE TABLE IF NOT EXISTS links (
          source_path TEXT NOT NULL,
          target_path TEXT NOT NULL,
          display TEXT NOT NULL,
          PRIMARY KEY (source_path, target_path, display)
        )
      `,
    });
    db.exec({
      sql: `
        CREATE INDEX IF NOT EXISTS links_target_idx
        ON links(target_path)
      `,
    });
    db.exec({
      sql: `
        CREATE INDEX IF NOT EXISTS links_source_idx
        ON links(source_path)
      `,
    });
  } catch (error) {
    console.warn("Failed to initialize links table", error);
    return;
  }
  const hasLinks = tableHasRows(db, "links");
  const hasPages = tableHasRows(db, "pages");
  if (!hasLinks && hasPages) {
    rebuildAllLinks(db);
  }
}

function tableHasRows(db, tableName) {
  let count = 0;
  try {
    db.exec({
      sql: `SELECT COUNT(1) AS rowCount FROM ${tableName}`,
      rowMode: "object",
      callback: function (row) {
        if (!row || typeof row !== "object") return;
        count = Number(row.rowCount || 0);
      },
    });
  } catch (error) {
    console.warn("Failed to count rows for table:", tableName, error);
  }
  return count > 0;
}

function rebuildAllLinks(db) {
  try {
    db.exec({ sql: "DELETE FROM links" });
  } catch (error) {
    console.warn("Failed to truncate links table before rebuild", error);
  }
  const pages = [];
  db.exec({
    sql: "SELECT path, body FROM pages",
    rowMode: "object",
    callback: function (row) {
      if (!row || typeof row !== "object") return;
      pages.push({
        path: String(row.path || ""),
        body: String(row.body || ""),
      });
    },
  });
  for (let i = 0; i < pages.length; i++) {
    insertLinksForSource(db, pages[i].path, pages[i].body);
  }
}

function replaceLinksForSource(db, sourcePath, body) {
  try {
    db.exec({
      sql: "DELETE FROM links WHERE source_path = $source",
      bind: { $source: sourcePath },
    });
  } catch (error) {
    console.warn("Failed to clear links for source", sourcePath, error);
  }
  insertLinksForSource(db, sourcePath, body);
}

function insertLinksForSource(db, sourcePath, body) {
  const links = extractWikiLinksFromBody(body);
  if (!links.length) {
    return;
  }
  for (let index = 0; index < links.length; index++) {
    const link = links[index];
    db.exec({
      sql: `
        INSERT OR IGNORE INTO links (source_path, target_path, display)
        VALUES ($source, $target, $display)
      `,
      bind: {
        $source: sourcePath,
        $target: link.targetPath,
        $display: link.display,
      },
    });
  }
}

function extractWikiLinksFromBody(body) {
  const matches = String(body || "").matchAll(/\[\[([^[\]]+)\]\]/g);
  const results = [];
  const seen = new Set();
  for (const match of matches) {
    const raw = match[1] ? String(match[1]).trim() : "";
    if (!raw || seen.has(raw)) {
      continue;
    }
    seen.add(raw);
    const targetPath = normalizeWikiLabelToPath(raw);
    if (!targetPath) {
      continue;
    }
    results.push({ targetPath: targetPath, display: raw });
  }
  return results;
}

function markRequestCancelled(targetId) {
  if (typeof targetId !== "number" || targetId <= 0) {
    return;
  }
  cancelledRequestIds.add(targetId);
}

function isRequestCancelled(id) {
  return cancelledRequestIds.has(id);
}

function consumeCancelledRequest(id) {
  if (!cancelledRequestIds.has(id)) {
    return false;
  }
  cancelledRequestIds.delete(id);
  return true;
}

function postIfNotCancelled(id, message) {
  if (consumeCancelledRequest(id)) {
    return;
  }
  // Suppress messages for timed-out requests so the UI does not resolve something it already discarded.
  self.postMessage(message);
}
