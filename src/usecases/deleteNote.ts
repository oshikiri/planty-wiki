import type { Note, NoteSummary } from "../domain/note";
import type { NoteStoragePort } from "./ports";
import type { PendingSave } from "../types/note";

export type DeleteNoteParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  pendingDeletionPath: string | null;
  pendingSave: PendingSave | null;
  sanitizeNoteForSave: (note: Note) => Note;
  selectedNotePath: string | null;
  noteStorage: NoteStoragePort;
};

export type DeleteNoteResult = {
  pendingDeletionPath: string | null;
  pendingSave: PendingSave | null;
  routePath?: string;
  nextNote?: Note | null;
  statusMessage?: string;
  deleted: boolean;
  storageUpdated: boolean;
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
  pendingDeletionPath,
  pendingSave,
  sanitizeNoteForSave,
  selectedNotePath,
  noteStorage,
}: DeleteNoteParams): Promise<DeleteNoteResult> {
  if (!pendingDeletionPath) {
    return {
      pendingDeletionPath,
      pendingSave,
      deleted: false,
      storageUpdated: false,
    };
  }
  const path = pendingDeletionPath;
  const nextPendingSave = pendingSave?.path === path ? null : pendingSave;
  const summaries = await noteStorage.loadNoteSummaries();
  const remaining = summaries.filter((summary) => summary.path !== path);
  const deleted = await deleteNoteViaService(path, noteStorage);
  if (!deleted) {
    return {
      pendingDeletionPath: null,
      pendingSave,
      statusMessage: "Failed to delete note",
      deleted: false,
      storageUpdated: false,
    };
  }
  const handledEmpty = await handleEmptyAfterDelete({
    remaining,
    defaultPage,
    deriveTitle,
    sanitizeNoteForSave,
    noteStorage,
  });
  const storageUpdatedFromEmpty = handledEmpty?.storageUpdated ?? false;
  if (handledEmpty) {
    return {
      pendingDeletionPath: null,
      pendingSave: nextPendingSave,
      routePath: handledEmpty.routePath,
      nextNote: handledEmpty.note,
      statusMessage: handledEmpty.statusMessage,
      deleted: true,
      storageUpdated: true,
    };
  }
  const nextPath = selectNextPathAfterDelete(summaries, remaining, path, selectedNotePath);
  let nextNote: Note | null = null;
  if (nextPath) {
    nextNote = await noteStorage.loadNote(nextPath);
  }
  return {
    pendingDeletionPath: null,
    pendingSave: nextPendingSave,
    routePath: nextPath ?? undefined,
    nextNote,
    deleted: true,
    storageUpdated: deleted || storageUpdatedFromEmpty,
  };
}

function selectNextPathAfterDelete(
  before: NoteSummary[],
  remaining: NoteSummary[],
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
  remaining: NoteSummary[];
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
  note: Note;
  routePath: string;
  statusMessage?: string;
  storageUpdated: boolean;
} | null> {
  if (remaining.length) {
    return null;
  }
  const now = new Date().toISOString();
  const fallbackNote = sanitizeNoteForSave({
    path: defaultPage,
    title: deriveTitle(defaultPage),
    body: "",
    updatedAt: now,
  });
  let statusMessage: string | undefined;
  let storageUpdated = false;
  try {
    await noteStorage.saveNote(fallbackNote);
    statusMessage = "Created a new default page after deleting the last note";
    storageUpdated = true;
  } catch (error) {
    console.error("Failed to recreate default note after deletion", error);
    statusMessage = "Failed to recreate default note";
  }
  return {
    note: fallbackNote,
    routePath: fallbackNote.path,
    statusMessage,
    storageUpdated,
  };
}
