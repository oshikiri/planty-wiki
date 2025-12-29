import type { Note } from "../domain/note";
import type { NoteStoragePort } from "./ports";
import type { PendingSave } from "../types/note";
import type { StateSetter } from "./state";

type DeleteNoteParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  notes: Note[];
  pendingDeletionPath: string | null;
  pendingSave: PendingSave | null;
  sanitizeNoteForSave: (note: Note) => Note;
  selectedNotePath: string | null;
  setNotes: StateSetter<Note[]>;
  setPendingDeletionPath: (next: string | null) => void;
  setPendingSave: StateSetter<PendingSave | null>;
  setStatusMessage: (message: string) => void;
  noteStorage: NoteStoragePort;
  openNoteRoute: (path: string) => void;
};

/**
 * Confirms deletion for the pending note, recreating a default page when needed before routing.
 *
 * @param params Dependencies required for deletion such as note lists and persistence APIs
 * @returns Promise that resolves once the process finishes
 */
export async function deletePendingNote({
  defaultPage,
  deriveTitle,
  notes,
  pendingDeletionPath,
  pendingSave,
  sanitizeNoteForSave,
  selectedNotePath,
  setNotes,
  setPendingDeletionPath,
  setPendingSave,
  setStatusMessage,
  noteStorage,
  openNoteRoute,
}: DeleteNoteParams): Promise<void> {
  if (!pendingDeletionPath) {
    return;
  }
  const path = pendingDeletionPath;
  setPendingDeletionPath(null);
  if (pendingSave?.path === path) {
    setPendingSave(null);
  }
  const previousNotes = notes;
  const remaining = previousNotes.filter((note) => note.path !== path);
  setNotes(remaining);
  const deleted = await deleteNoteViaService(path, noteStorage, setStatusMessage, () => {
    setNotes(previousNotes);
  });
  if (!deleted) {
    return;
  }
  const handledEmpty = await handleEmptyAfterDelete({
    remaining,
    defaultPage,
    deriveTitle,
    sanitizeNoteForSave,
    setNotes,
    setStatusMessage,
    noteStorage,
    openNoteRoute,
  });
  if (handledEmpty) {
    return;
  }
  const nextPath = selectNextPathAfterDelete(previousNotes, remaining, path, selectedNotePath);
  if (!nextPath) {
    return;
  }
  openNoteRoute(nextPath);
}

function selectNextPathAfterDelete(
  before: Note[],
  remaining: Note[],
  deletedPath: string,
  selectedPath: string | null,
): string | null {
  if (!remaining.length) {
    return null;
  }
  const selectionStillExists = remaining.some((note) => note.path === selectedPath);
  if (deletedPath !== selectedPath && selectionStillExists) {
    return selectedPath;
  }
  const index = before.findIndex((note) => note.path === deletedPath);
  if (index === -1) {
    return remaining[0].path;
  }
  const nextIndex = index > 0 ? index - 1 : 0;
  return remaining[nextIndex]?.path ?? remaining[0].path;
}

async function deleteNoteViaService(
  path: string,
  noteStorage: NoteStoragePort,
  setStatusMessage: (message: string) => void,
  rollbackNotes: () => void,
): Promise<boolean> {
  try {
    await noteStorage.deleteNote(path);
    return true;
  } catch (error) {
    console.error("Failed to delete note from storage", error);
    setStatusMessage("Failed to delete note");
    rollbackNotes();
    return false;
  }
}

type HandleEmptyAfterDeleteParams = {
  remaining: Note[];
  defaultPage: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: (nextNotes: Note[]) => void;
  setStatusMessage: (message: string) => void;
  noteStorage: NoteStoragePort;
  openNoteRoute: (path: string) => void;
};

async function handleEmptyAfterDelete({
  remaining,
  defaultPage,
  deriveTitle,
  sanitizeNoteForSave,
  setNotes,
  setStatusMessage,
  noteStorage,
  openNoteRoute,
}: HandleEmptyAfterDeleteParams): Promise<boolean> {
  if (remaining.length) {
    return false;
  }
  const fallbackNote = sanitizeNoteForSave({
    path: defaultPage,
    title: deriveTitle(defaultPage),
    body: "",
  });
  setNotes([fallbackNote]);
  try {
    await noteStorage.saveNote(fallbackNote);
    setStatusMessage("Created a new default page after deleting the last note");
  } catch (error) {
    console.error("Failed to recreate default note after deletion", error);
    setStatusMessage("Failed to recreate default note");
  }
  openNoteRoute(fallbackNote.path);
  return true;
}
