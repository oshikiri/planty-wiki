import type { Note } from "../domain/note";
import type { NoteStoragePort } from "./ports";
import type { PendingSave } from "../types/note";

export type DeleteNoteParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  notes: Note[];
  pendingDeletionPath: string | null;
  pendingSave: PendingSave | null;
  sanitizeNoteForSave: (note: Note) => Note;
  selectedNotePath: string | null;
  noteStorage: NoteStoragePort;
};

export type DeleteNoteResult = {
  notes: Note[];
  pendingDeletionPath: string | null;
  pendingSave: PendingSave | null;
  routePath?: string;
  statusMessage?: string;
};

/**
 * Confirms deletion for the pending note, recreating a default page when needed before routing.
 *
 * @param params Dependencies required for deletion such as note lists and persistence APIs
 * @returns Result containing updated notes, pending state, and next route
 */
export async function deletePendingNote({
  defaultPage,
  deriveTitle,
  notes,
  pendingDeletionPath,
  pendingSave,
  sanitizeNoteForSave,
  selectedNotePath,
  noteStorage,
}: DeleteNoteParams): Promise<DeleteNoteResult> {
  if (!pendingDeletionPath) {
    return {
      notes,
      pendingDeletionPath,
      pendingSave,
    };
  }
  const path = pendingDeletionPath;
  const nextPendingSave = pendingSave?.path === path ? null : pendingSave;
  const remaining = notes.filter((note) => note.path !== path);
  const deleted = await deleteNoteViaService(path, noteStorage);
  if (!deleted) {
    return {
      notes,
      pendingDeletionPath: null,
      pendingSave,
      statusMessage: "Failed to delete note",
    };
  }
  const handledEmpty = await handleEmptyAfterDelete({
    remaining,
    defaultPage,
    deriveTitle,
    sanitizeNoteForSave,
    noteStorage,
  });
  if (handledEmpty) {
    return {
      notes: handledEmpty.notes,
      pendingDeletionPath: null,
      pendingSave: nextPendingSave,
      routePath: handledEmpty.routePath,
      statusMessage: handledEmpty.statusMessage,
    };
  }
  const nextPath = selectNextPathAfterDelete(notes, remaining, path, selectedNotePath);
  return {
    notes: remaining,
    pendingDeletionPath: null,
    pendingSave: nextPendingSave,
    routePath: nextPath ?? undefined,
  };
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

async function deleteNoteViaService(path: string, noteStorage: NoteStoragePort): Promise<boolean> {
  try {
    await noteStorage.deleteNote(path);
    return true;
  } catch (error) {
    console.error("Failed to delete note from storage", error);
    return false;
  }
}

type HandleEmptyAfterDeleteParams = {
  remaining: Note[];
  defaultPage: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  noteStorage: NoteStoragePort;
};

async function handleEmptyAfterDelete({
  remaining,
  defaultPage,
  deriveTitle,
  sanitizeNoteForSave,
  noteStorage,
}: HandleEmptyAfterDeleteParams): Promise<{
  notes: Note[];
  routePath: string;
  statusMessage?: string;
} | null> {
  if (remaining.length) {
    return null;
  }
  const fallbackNote = sanitizeNoteForSave({
    path: defaultPage,
    title: deriveTitle(defaultPage),
    body: "",
  });
  let statusMessage: string | undefined;
  try {
    await noteStorage.saveNote(fallbackNote);
    statusMessage = "Created a new default page after deleting the last note";
  } catch (error) {
    console.error("Failed to recreate default note after deletion", error);
    statusMessage = "Failed to recreate default note";
  }
  return {
    notes: [fallbackNote],
    routePath: fallbackNote.path,
    statusMessage,
  };
}
