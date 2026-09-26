CREATE TABLE IF NOT EXISTS notes (
    note_id TEXT NOT NULL,
    path TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    version INTEGER NOT NULL,
    change_sequence INTEGER NOT NULL,
    deleted_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (note_id),
    UNIQUE (path)
);

CREATE TABLE IF NOT EXISTS operations (
    operation_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (operation_id)
);

CREATE TABLE IF NOT EXISTS changes (
    change_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('upsert', 'delete')),
    path TEXT,
    title TEXT,
    body TEXT,
    deleted_at TEXT,
    updated_at TEXT NOT NULL
);
