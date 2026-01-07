import type { Note, NoteSummary } from "../domain/note";

export type NoteStoragePort = {
  loadNoteSummaries: () => Promise<NoteSummary[]>;
  loadNote: (path: Note["path"]) => Promise<Note | null>;
  saveNote: (note: Note) => Promise<void>;
  deleteNote: (path: Note["path"]) => Promise<void>;
};

export type AppRoute = { kind: "note"; path: string } | { kind: "query" };
