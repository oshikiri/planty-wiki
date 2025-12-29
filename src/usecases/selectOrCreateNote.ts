import { normalizePath } from "../domain/path";
import type { Note } from "../domain/note";
import type { NoteStoragePort } from "./ports";
import type { StateSetter } from "./state";

type SelectOrCreateNoteParams = {
  path: string;
  defaultPage: string;
  deriveTitle: (path: string) => string;
  notes: Note[];
  sanitizeNoteForSave: (note: Note) => Note;
  setDraftBody: (nextBody: string) => void;
  setNotes: StateSetter<Note[]>;
  setStatusMessage: (message: string) => void;
  openNoteRoute: (path: string) => void;
  noteStorage: Pick<NoteStoragePort, "saveNote">;
};

/**
 * Normalizes the given path and performs selection or creation before routing to the note.
 *
 * @param params Dependencies required for the transition such as note lists and save functions
 * @returns Promise that resolves when the flow completes
 */
export async function selectOrCreateNote({
  path,
  defaultPage,
  deriveTitle,
  notes,
  sanitizeNoteForSave,
  setDraftBody,
  setNotes,
  setStatusMessage,
  openNoteRoute,
  noteStorage,
}: SelectOrCreateNoteParams): Promise<void> {
  const normalized = path ? normalizePath(path) : defaultPage;
  const existingNote = notes.find((note) => note.path === normalized);
  if (!existingNote) {
    const title = deriveTitle(normalized);
    const newNote = sanitizeNoteForSave({ path: normalized, title, body: "" });
    setNotes((prev) => [...prev, newNote]);
    try {
      await noteStorage.saveNote(newNote);
    } catch (error) {
      console.error("Failed to create note via selectOrCreateNote", error);
      setStatusMessage("Failed to create note");
    }
    setDraftBody(newNote.body);
    openNoteRoute(normalized);
    return;
  }
  setDraftBody(existingNote.body);
  openNoteRoute(normalized);
}
