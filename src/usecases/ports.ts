import type { Note } from "../domain/note";

export type NoteStoragePort = {
  loadNotes: () => Promise<Note[]>;
  saveNote: (note: Note) => Promise<void>;
  deleteNote: (path: Note["path"]) => Promise<void>;
};

export type AppRoute = { kind: "note"; path: string } | { kind: "query" };
