let dbPromise = null;
const cancelledRequestIds = new Set();
const MAX_QUERY_ROWS = 200;
const SYNC_INPUT_LIMITS = { path: 512, title: 1024, body: 50000 };
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

    if (type === "loadSyncConflicts") {
      handleLoadSyncConflicts(db, id);
      return;
    }

    if (type === "resolveSyncConflict") {
      handleResolveSyncConflict(db, id, payload);
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
  var path = normalizeAndValidatePath(note.path);
  var title = extractAndValidateText(note.title, SYNC_INPUT_LIMITS.title);
  var body = extractAndValidateText(note.body, SYNC_INPUT_LIMITS.body, { allowEmpty: true });
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
    return null;
  }
  if (!value && !allowEmpty) {
    return null;
  }
  if (value.length > maxLength) {
    return null;
  }
  return value;
}

function normalizeAndValidatePath(value) {
  if (typeof value !== "string") {
    return null;
  }
  const path = value.normalize("NFC");
  const segments = path.split("/").slice(1);
  const hasInvalidSegment = segments.some(function (segment) {
    return segment === "" || segment === "." || segment === "..";
  });
  if (
    !path.startsWith("/pages/") ||
    path.endsWith("/") ||
    hasInvalidSegment ||
    /\p{Cc}/u.test(path) ||
    path.length > SYNC_INPUT_LIMITS.path
  ) {
    return null;
  }
  return path;
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

function handleLoadSyncConflicts(db, id) {
  postIfNotCancelled(id, { id: id, ok: true, result: readSyncConflicts(db) });
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

function readSyncConflicts(db) {
  var conflicts = [];
  db.exec({
    sql:
      "SELECT note_id, operation_id, base_version, local_json, server_json, created_at " +
      "FROM sync_conflicts ORDER BY created_at ASC, note_id ASC",
    rowMode: "object",
    callback: function (row) {
      if (!row || typeof row !== "object") return;
      var local = parseJsonObject(row.local_json);
      if (!local) return;
      conflicts.push({
        noteId: String(row.note_id || ""),
        operationId: String(row.operation_id || ""),
        baseVersion: Number(row.base_version || 0),
        local: local,
        server: parseJsonObject(row.server_json),
        createdAt: String(row.created_at || ""),
      });
    },
  });
  return conflicts;
}

function parseJsonObject(value) {
  if (typeof value !== "string") return null;
  try {
    var parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function recordSyncConflict(db, change, response) {
  var server = normalizeConflictServer(response, change.noteId);
  // Preserve edits made while the conflicting request was in flight.
  change = readPendingSyncChanges(db).find(function (pending) {
    return pending.noteId === change.noteId;
  }) || change;
  var conflict = {
    noteId: change.noteId,
    operationId: change.operationId,
    baseVersion: change.baseVersion,
    local: change,
    server: server,
    createdAt: new Date().toISOString(),
  };
  db.exec({ sql: "BEGIN" });
  try {
    db.exec({
      sql:
        "INSERT INTO sync_conflicts " +
        "(note_id, operation_id, base_version, local_json, server_json, created_at, updated_at) " +
        "VALUES ($note_id, $operation_id, $base_version, $local_json, $server_json, $created_at, $updated_at) " +
        "ON CONFLICT(note_id) DO UPDATE SET operation_id = excluded.operation_id, " +
        "base_version = excluded.base_version, local_json = excluded.local_json, " +
        "server_json = excluded.server_json, updated_at = excluded.updated_at",
      bind: {
        $note_id: conflict.noteId,
        $operation_id: conflict.operationId,
        $base_version: conflict.baseVersion,
        $local_json: JSON.stringify(conflict.local),
        $server_json: server ? JSON.stringify(server) : null,
        $created_at: conflict.createdAt,
        $updated_at: conflict.createdAt,
      },
    });
    db.exec({
      sql: "DELETE FROM sync_outbox WHERE note_id = $note_id",
      bind: { $note_id: change.noteId },
    });
    db.exec({ sql: "COMMIT" });
    return conflict;
  } catch (error) {
    rollbackTransaction(db);
    throw error;
  }
}

function normalizeConflictServer(response, noteId) {
  var note = response && typeof response === "object" ? response.note : null;
  if (!note || typeof note !== "object" || note.noteId !== noteId) {
    return null;
  }
  if (
    !Number.isSafeInteger(note.version) ||
    !Number.isSafeInteger(note.changeSequence) ||
    typeof note.updatedAt !== "string" ||
    typeof note.deleted !== "boolean"
  ) {
    return null;
  }
  return {
    noteId: note.noteId,
    version: note.version,
    changeSequence: note.changeSequence,
    deleted: note.deleted,
    path: typeof note.path === "string" ? note.path : null,
    title: typeof note.title === "string" ? note.title : null,
    body: typeof note.body === "string" ? note.body : null,
    updatedAt: note.updatedAt,
  };
}

function handleResolveSyncConflict(db, id, payload) {
  // Resolve after any in-flight sync has finished applying its response.
  syncRequest = syncRequest.catch(() => undefined).then(function () {
    resolveStoredSyncConflict(db, id, payload);
  });
  return syncRequest;
}

function resolveStoredSyncConflict(db, id, payload) {
  // Queued resolutions must not change data after the caller has timed out.
  if (consumeCancelledRequest(id)) return;
  var noteId = payload && typeof payload.noteId === "string" ? payload.noteId : "";
  var choice = payload && payload.choice;
  var stored = findStoredSyncConflict(db, noteId);
  var local = stored && parseJsonObject(stored.local_json);
  var server = stored && parseJsonObject(stored.server_json);
  if (!local || (choice !== "local" && choice !== "server")) {
    postIfNotCancelled(id, { id: id, ok: false, error: "Invalid conflict resolution" });
    return;
  }
  try {
    db.exec({ sql: "BEGIN" });
    db.exec({
      sql: "DELETE FROM sync_outbox WHERE note_id = $note_id",
      bind: { $note_id: noteId },
    });
    var path = choice === "server"
      ? adoptConflictServer(db, local, server)
      : keepConflictLocal(db, local, server, payload.path);
    db.exec({
      sql: "DELETE FROM sync_conflicts WHERE note_id = $note_id",
      bind: { $note_id: noteId },
    });
    db.exec({ sql: "COMMIT" });
    postIfNotCancelled(id, {
      id: id, ok: true, result: { previousPath: local.path, path: path },
    });
  } catch (error) {
    rollbackTransaction(db);
    postIfNotCancelled(id, {
      id: id,
      ok: false,
      error: error && error.message ? String(error.message) : "Failed to resolve Cloud Sync conflict",
    });
  }
}

function adoptConflictServer(db, local, server) {
  if (!server) {
    removeConflictLocalNote(db, local);
    return null;
  }
  var error = applyRemoteChange(db, {
    changeSequence: server.changeSequence,
    noteId: server.noteId,
    version: server.version,
    kind: server.deleted ? "delete" : "upsert",
    path: server.path,
    title: server.title,
    body: server.body,
    deletedAt: server.deleted ? server.updatedAt : null,
    updatedAt: server.updatedAt,
  });
  if (error) {
    throw new Error("Cannot apply the server version: " + error.error);
  }
  return server.deleted ? null : server.path;
}

function keepConflictLocal(db, local, server, requestedPath) {
  var path = requestedPath === undefined ? local.path : normalizeAndValidatePath(requestedPath);
  if (!path || (!server && (path === local.path || local.deleted))) {
    throw new Error("Choose a different valid page path to keep the local note");
  }
  var other = findSyncNoteByPath(db, path);
  if ((other && other.noteId !== local.noteId) || (path !== local.path && findPageByPath(db, path))) {
    throw new Error("The chosen path already belongs to another local note");
  }
  var now = new Date().toISOString();
  if (path !== local.path) {
    removeConflictLocalNote(db, local);
  }
  var operation = { ...local, path: path, operationId: createSyncNoteId(),
    baseVersion: server ? server.version : local.baseVersion, createdAt: now };
  writeConflictLocalPage(db, operation, now);
  upsertSyncNote(db, {
    path: path, noteId: local.noteId,
    version: operation.baseVersion,
    changeSequence: server ? server.changeSequence : 0,
    deleted: local.deleted, updatedAt: now,
  });
  // The conflict row must be removed before enqueueing a resolved operation.
  db.exec({ sql: "DELETE FROM sync_conflicts WHERE note_id = $note_id",
    bind: { $note_id: local.noteId } });
  enqueueSyncChange(db, operation);
  return local.deleted ? null : path;
}

function writeConflictLocalPage(db, local, now) {
  if (local.deleted) {
    db.exec({ sql: "DELETE FROM pages WHERE path = $path", bind: { $path: local.path } });
    db.exec({ sql: "DELETE FROM links WHERE source_path = $path", bind: { $path: local.path } });
    return;
  }
  db.exec({
    sql: "INSERT INTO pages (path, title, body, updated_at) VALUES ($path, $title, $body, $updated_at) " +
      "ON CONFLICT(path) DO UPDATE SET title = excluded.title, body = excluded.body, updated_at = excluded.updated_at",
    bind: { $path: local.path, $title: local.title, $body: local.body, $updated_at: now },
  });
  replaceLinksForSource(db, local.path, local.body);
}

function removeConflictLocalNote(db, local) {
  var current = findSyncNoteById(db, local.noteId);
  if (current) {
    db.exec({ sql: "DELETE FROM pages WHERE path = $path", bind: { $path: current.path } });
    db.exec({ sql: "DELETE FROM links WHERE source_path = $path", bind: { $path: current.path } });
  }
  db.exec({ sql: "DELETE FROM sync_notes WHERE note_id = $note_id", bind: { $note_id: local.noteId } });
  db.exec({ sql: "DELETE FROM sync_deleted_notes WHERE note_id = $note_id", bind: { $note_id: local.noteId } });
}

function findStoredSyncConflict(db, noteId) {
  var conflict = null;
  db.exec({
    sql:
      "SELECT note_id, operation_id, base_version, local_json, server_json, created_at " +
      "FROM sync_conflicts WHERE note_id = $note_id LIMIT 1",
    rowMode: "object",
    bind: { $note_id: noteId },
    callback: function (row) {
      if (row && typeof row === "object") conflict = row;
    },
  });
  return conflict;
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
    if (result.status === "conflict") {
      const conflict = recordSyncConflict(db, change, result.response);
      return {
        status: "conflict",
        noteId: change.noteId,
        conflict: conflict,
        syncedChanges: syncedChanges,
        receivedChanges: 0,
      };
    }
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

      if (hasSyncConflict(db, change.noteId)) {
        var storedConflict = findStoredSyncConflict(db, change.noteId);
        var localConflict = parseJsonObject(storedConflict?.local_json);
        var serverConflict = parseJsonObject(storedConflict?.server_json);
        if (nextAfter !== cursor) {
          writeSyncCursor(db, nextAfter);
        }
        db.exec({ sql: "COMMIT" });
        if (localConflict) {
          return {
            status: "conflict",
            noteId: change.noteId,
            conflict: {
              noteId: change.noteId,
              operationId: String(storedConflict.operation_id || ""),
              baseVersion: Number(storedConflict.base_version || 0),
              local: localConflict,
              server: serverConflict,
              createdAt: String(storedConflict.created_at || ""),
            },
            nextAfter: nextAfter,
            receivedChanges: receivedChanges,
          };
        }
        throw new Error("Invalid stored Cloud Sync conflict");
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

function hasSyncConflict(db, noteId) {
  var conflict = null;
  db.exec({
    sql: "SELECT note_id FROM sync_conflicts WHERE note_id = $note_id LIMIT 1",
    rowMode: "object",
    bind: { $note_id: noteId },
    callback: function (row) {
      if (row && typeof row === "object") {
        conflict = row;
      }
    },
  });
  return Boolean(conflict);
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
  if (hasSyncConflict(db, change.noteId)) {
    db.exec({
      sql: "UPDATE sync_conflicts SET operation_id = $operation_id, base_version = $base_version, " +
        "local_json = $local_json, updated_at = $updated_at WHERE note_id = $note_id",
      bind: { $operation_id: change.operationId, $base_version: change.baseVersion,
        $local_json: JSON.stringify(change), $updated_at: change.createdAt, $note_id: change.noteId },
    });
    return;
  }
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
  const limitError = validateImportBatchLimits(notes);
  if (limitError) {
    postIfNotCancelled(id, { id: id, ok: false, error: limitError });
    return;
  }
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

function validateImportBatchLimits(notes) {
  if (notes.length > 1000) {
    return "Directory import file count limit exceeded";
  }
  var totalBodyLength = 0;
  for (const note of notes) {
    if (!note || typeof note !== "object") {
      return "Invalid note payload";
    }
    if (typeof note.body === "string") {
      totalBodyLength += note.body.length;
    }
  }
  if (totalBodyLength > 20000000) {
    return "Directory import total size limit exceeded";
  }
  return null;
}

function sanitizeNoteForImport(note, fallbackUpdatedAt, index) {
  const record = note || {};
  const path = normalizeAndValidatePath(record.path);
  const title = extractAndValidateText(record.title, SYNC_INPUT_LIMITS.title);
  const body = extractAndValidateText(record.body, SYNC_INPUT_LIMITS.body, { allowEmpty: true });
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
      "CREATE TABLE IF NOT EXISTS sync_conflicts (" +
      "note_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, base_version INTEGER NOT NULL, " +
      "local_json TEXT NOT NULL, server_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
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
