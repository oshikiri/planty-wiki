let dbPromise = null;
const cancelledRequestIds = new Set();
const MAX_QUERY_ROWS = 200;

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

    if (type === "searchNotes") {
      handleSearchNotes(db, id, payload);
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
        importScripts("/sqlite3.js");
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
        initializeFtsStructures(db);
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
  db.exec({
    sql:
      "INSERT INTO pages (path, title, body, updated_at) VALUES ($path, $title, $body, $updated_at) " +
      "ON CONFLICT(path) DO UPDATE SET title = excluded.title, body = excluded.body, updated_at = excluded.updated_at",
    bind: {
      $path: path,
      $title: title,
      $body: body,
      $updated_at: typeof note.updatedAt === "string" ? note.updatedAt : now,
    },
  });
  replaceLinksForSource(db, path, body);
  postIfNotCancelled(id, { id: id, ok: true, result: null });
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
  db.exec({
    sql: "DELETE FROM pages WHERE path = $path",
    bind: { $path: path },
  });
  db.exec({
    sql: "DELETE FROM links WHERE source_path = $path",
    bind: { $path: path },
  });
  postIfNotCancelled(id, { id: id, ok: true, result: null });
}

function handleBulkSaveNotes(db, id, payload) {
  const notes = Array.isArray(payload) ? payload : [];
  const nowForBulk = new Date().toISOString();
  for (let attempt = 0; attempt < 2; attempt++) {
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
      return;
    } catch (error) {
      try {
        db.exec({ sql: "ROLLBACK" });
      } catch (rollbackError) {
        console.error("Failed to rollback bulk import", rollbackError);
      }
      if (isSqliteCorruptVtabError(error) && attempt === 0) {
        console.warn(
          "Detected corrupted pages_fts during bulk import. Rebuilding search index before retrying.",
          error,
        );
        rebuildFtsStructures(db);
        continue;
      }
      postIfNotCancelled(id, {
        id: id,
        ok: false,
        error: error && error.message ? String(error.message) : "Failed to import notes",
      });
      return;
    }
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

function handleSearchNotes(db, id, payload) {
  var query = "";
  if (payload && typeof payload.query === "string") {
    query = payload.query.trim();
  }
  if (!query) {
    postIfNotCancelled(id, { id: id, ok: true, result: [] });
    return;
  }
  var rows = [];
  try {
    db.exec({
      sql: `
        SELECT p.path AS path, p.title AS title,
               snippet(pages_fts, 2, '[', ']', '…', 10) AS snippet
        FROM pages_fts
        JOIN pages AS p ON p.rowid = pages_fts.rowid
        WHERE pages_fts MATCH $query
        ORDER BY rank
        LIMIT 50
      `,
      bind: { $query: query },
      rowMode: "object",
      callback: function (row) {
        if (!row || typeof row !== "object") return;
        rows.push({
          path: String(row.path || ""),
          title: String(row.title || ""),
          snippet: typeof row.snippet === "string" ? row.snippet : "",
        });
      },
    });
    postIfNotCancelled(id, { id: id, ok: true, result: rows });
  } catch (error) {
    postIfNotCancelled(id, {
      id: id,
      ok: false,
      error: error && error.message ? String(error.message) : String(error),
    });
  }
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

function initializeFtsStructures(db) {
  try {
    db.exec({
      sql: `
        CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts
        USING fts5(path, title, body, content='pages', content_rowid='rowid')
      `,
    });
    db.exec({
      sql: `
        CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
          INSERT INTO pages_fts(rowid, path, title, body) VALUES (new.rowid, new.path, new.title, new.body);
        END;
      `,
    });
    db.exec({
      sql: `
        CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
          INSERT INTO pages_fts(pages_fts, rowid, path, title, body)
            VALUES ('delete', old.rowid, old.path, old.title, old.body);
        END;
      `,
    });
    db.exec({
      sql: `
        CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
          INSERT INTO pages_fts(pages_fts, rowid, path, title, body)
            VALUES ('delete', old.rowid, old.path, old.title, old.body);
          INSERT INTO pages_fts(rowid, path, title, body) VALUES (new.rowid, new.path, new.title, new.body);
        END;
      `,
    });
    db.exec({
      sql: `
        INSERT INTO pages_fts(rowid, path, title, body)
        SELECT p.rowid, p.path, p.title, p.body
        FROM pages AS p
        WHERE NOT EXISTS (SELECT 1 FROM pages_fts WHERE rowid = p.rowid)
      `,
    });
  } catch (error) {
    console.warn("Failed to initialize FTS5 tables or triggers", error);
  }
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

function rebuildFtsStructures(db) {
  try {
    db.exec({ sql: "DROP TRIGGER IF EXISTS pages_ai" });
    db.exec({ sql: "DROP TRIGGER IF EXISTS pages_ad" });
    db.exec({ sql: "DROP TRIGGER IF EXISTS pages_au" });
    db.exec({ sql: "DROP TABLE IF EXISTS pages_fts" });
  } catch (error) {
    console.error("Failed to drop existing FTS structures before rebuild", error);
  }
  initializeFtsStructures(db);
}

function isSqliteCorruptVtabError(error) {
  if (!error) {
    return false;
  }
  var message = "";
  if (typeof error === "string") {
    message = error;
  } else if (typeof error.message === "string") {
    message = error.message;
  }
  return message.indexOf("SQLITE_CORRUPT_VTAB") !== -1;
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
