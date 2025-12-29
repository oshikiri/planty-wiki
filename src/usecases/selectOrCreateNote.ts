import { normalizePath } from "../domain/path";
import type { Note } from "../domain/note";
import type { NoteStoragePort } from "./ports";

type SelectOrCreateNoteParams = {
  path: string;
  defaultPage: string;
  deriveTitle: (path: string) => string;
  notes: Note[];
  sanitizeNoteForSave: (note: Note) => Note;
  noteStorage: Pick<NoteStoragePort, "saveNote">;
};

export type SelectOrCreateNoteResult = {
  notes: Note[];
  draftBody: string;
  routePath: string;
  statusMessage?: string;
};

/**
 * Normalizes the given path and performs selection or creation before routing to the note.
 *
 * @param params Dependencies required for the transition such as note lists and save functions
 * @returns Next note state, draft body, and route path
 */
export async function selectOrCreateNote({
  path,
  defaultPage,
  deriveTitle,
  notes,
  sanitizeNoteForSave,
  noteStorage,
}: SelectOrCreateNoteParams): Promise<SelectOrCreateNoteResult> {
  const normalized = path ? normalizePath(path) : defaultPage;
  const existingNote = notes.find((note) => note.path === normalized);
  if (!existingNote) {
    const title = deriveTitle(normalized);
    const newNote = sanitizeNoteForSave({ path: normalized, title, body: "" });
    const nextNotes = [...notes, newNote];
    let statusMessage: string | undefined;
    try {
      await noteStorage.saveNote(newNote);
    } catch (error) {
      console.error("Failed to create note via selectOrCreateNote", error);
      statusMessage = "Failed to create note";
    }
    return {
      notes: nextNotes,
      draftBody: newNote.body,
      routePath: normalized,
      statusMessage,
    };
  }
  return {
    notes,
    draftBody: existingNote.body,
    routePath: normalized,
  };
}
