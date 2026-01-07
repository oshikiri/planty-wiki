import type { Note } from "../domain/note";

export type { Note, NoteSummary, SearchResult } from "../domain/note";

export type PendingSave = {
  path: Note["path"];
  title: string;
  body: string;
};
