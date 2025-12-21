import { useCallback, type Dispatch, type StateUpdater } from "preact/hooks";

import { formatHashFromPath } from "../navigation";
import type { Note, PendingSave } from "../types/note";
import type { NoteService } from "../services/note-service";

export type UseDeleteNoteParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  notes: Note[];
  pendingDeletionPath: string | null;
  sanitizeNoteForSave: (note: Note) => Note;
  selectedPath: string;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  setPendingDeletionPath: Dispatch<StateUpdater<string | null>>;
  setPendingSave: Dispatch<StateUpdater<PendingSave | null>>;
  setSelectedPath: Dispatch<StateUpdater<string>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  noteService: NoteService;
};

/**
 * useDeleteNoteは削除待ちのノートを安全に消し、必要ならデフォルトノートを生成するコールバックを返す。
 *
 * @param params 削除処理に必要なノート配列や状態更新関数
 * @returns 削除確定時に呼ぶasyncハンドラ
 */
export function useDeleteNote({
  defaultPage,
  deriveTitle,
  notes,
  pendingDeletionPath,
  sanitizeNoteForSave,
  selectedPath,
  setNotes,
  setPendingDeletionPath,
  setPendingSave,
  setSelectedPath,
  setStatusMessage,
  noteService,
}: UseDeleteNoteParams) {
  return useCallback(async () => {
    if (!pendingDeletionPath) return;
    const path = pendingDeletionPath;
    setPendingDeletionPath(null);
    clearPendingSaveForPath(path, setPendingSave);
    const previousNotes = notes;
    const remaining = previousNotes.filter((note) => note.path !== path);
    setNotes(remaining);
    const deleted = await deleteNoteViaService(
      path,
      noteService,
      setStatusMessage,
      setNotes,
      previousNotes,
    );
    if (!deleted) {
      return;
    }
    const handledEmpty = await handleEmptyAfterDelete({
      remaining,
      defaultPage,
      deriveTitle,
      sanitizeNoteForSave,
      setNotes,
      setSelectedPath,
      setStatusMessage,
      noteService,
    });
    if (handledEmpty) {
      return;
    }
    const nextPath = selectNextPathAfterDelete(previousNotes, remaining, path, selectedPath);
    if (!nextPath) return;
    setSelectedPath(nextPath);
    window.location.hash = formatHashFromPath(nextPath);
  }, [
    defaultPage,
    deriveTitle,
    notes,
    pendingDeletionPath,
    sanitizeNoteForSave,
    selectedPath,
    setNotes,
    setPendingDeletionPath,
    setPendingSave,
    setSelectedPath,
    setStatusMessage,
    noteService,
  ]);
}

function selectNextPathAfterDelete(
  before: Note[],
  remaining: Note[],
  deletedPath: string,
  selectedPath: string,
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

function clearPendingSaveForPath(
  path: string,
  setPendingSave: Dispatch<StateUpdater<PendingSave | null>>,
) {
  setPendingSave((prev) => {
    if (prev && prev.path === path) {
      return null;
    }
    return prev;
  });
}

async function deleteNoteViaService(
  path: string,
  noteService: NoteService,
  setStatusMessage: Dispatch<StateUpdater<string>>,
  setNotes: Dispatch<StateUpdater<Note[]>>,
  previousNotes: Note[],
) {
  try {
    await noteService.deleteNote(path);
    return true;
  } catch (error) {
    console.error("Failed to delete note from storage", error);
    setStatusMessage("Failed to delete note");
    setNotes(previousNotes);
    return false;
  }
}

type HandleEmptyAfterDeleteParams = {
  remaining: Note[];
  defaultPage: string;
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  setSelectedPath: Dispatch<StateUpdater<string>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  noteService: NoteService;
};

async function handleEmptyAfterDelete({
  remaining,
  defaultPage,
  deriveTitle,
  sanitizeNoteForSave,
  setNotes,
  setSelectedPath,
  setStatusMessage,
  noteService,
}: HandleEmptyAfterDeleteParams) {
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
    await noteService.saveNote(fallbackNote);
    setStatusMessage("Created a new default page after deleting the last note");
  } catch (error) {
    console.error("Failed to recreate default note after deletion", error);
    setStatusMessage("Failed to recreate default note");
  }
  setSelectedPath(fallbackNote.path);
  window.location.hash = formatHashFromPath(fallbackNote.path);
  return true;
}
