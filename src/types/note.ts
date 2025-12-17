import type { Note } from "../storage";

export type PendingSave = {
  path: Note["path"];
  title: string;
  body: string;
};
