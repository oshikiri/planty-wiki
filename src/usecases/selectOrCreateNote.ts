import { normalizePath } from "../domain/path";
import type { Note } from "../domain/note";
import type { NoteStoragePort } from "./ports";

type SelectOrCreateNoteParams = {
  path: string;
  defaultPage: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  noteStorage: Pick<NoteStoragePort, "saveNote" | "loadNote">;
};

export type SelectOrCreateNoteResult = {
  note: Note;
  routePath: string;
  statusMessage?: string;
  created: boolean;
};

/**
 * Normalizes the given path and performs selection or creation before routing to the note.
 *
 * @param params Dependencies required for the transition such as storage access and sanitizers
 * @returns Loaded note, target route path, and optional status
 */
export async function selectOrCreateNote({
  path,
  defaultPage,
  deriveTitle,
  sanitizeNoteForSave,
  noteStorage,
}: SelectOrCreateNoteParams): Promise<SelectOrCreateNoteResult> {
  const normalized = path ? normalizePath(path) : defaultPage;
  const existing = await noteStorage.loadNote(normalized);
  if (existing) {
    return { note: existing, routePath: normalized, created: false };
  }
  const now = new Date().toISOString();
  const newNote = sanitizeNoteForSave({
    path: normalized,
    title: deriveTitle(normalized),
    body: "",
    updatedAt: now,
  });
  let statusMessage: string | undefined;
  try {
    await noteStorage.saveNote(newNote);
  } catch (error) {
    console.error("Failed to create note via selectOrCreateNote", error);
    statusMessage = "Failed to create note";
  }
  return {
    note: newNote,
    routePath: normalized,
    statusMessage,
    created: true,
  };
}
