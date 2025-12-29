import { useCallback, type Dispatch, type StateUpdater } from "preact/hooks";

import type { Route } from "../navigation/route";
import type { Router } from "../navigation/router";
import type { Note, PendingSave } from "../types/note";
import type { NoteService } from "../services/note-service";
import { deletePendingNote } from "../usecases/deleteNote";

export type UseDeleteNoteParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  notes: Note[];
  pendingDeletionPath: string | null;
  sanitizeNoteForSave: (note: Note) => Note;
  selectedNotePath: string | null;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  setPendingDeletionPath: Dispatch<StateUpdater<string | null>>;
  setPendingSave: Dispatch<StateUpdater<PendingSave | null>>;
  setRoute: Dispatch<StateUpdater<Route>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  noteService: NoteService;
  router: Router;
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
  selectedNotePath,
  setNotes,
  setPendingDeletionPath,
  setPendingSave,
  setRoute,
  setStatusMessage,
  noteService,
  router,
}: UseDeleteNoteParams) {
  return useCallback(async () => {
    await deletePendingNote({
      defaultPage,
      deriveTitle,
      notes,
      pendingDeletionPath,
      sanitizeNoteForSave,
      selectedNotePath,
      setNotes,
      setPendingDeletionPath,
      setPendingSave,
      setRoute,
      setStatusMessage,
      noteService,
      router,
    });
  }, [
    defaultPage,
    deriveTitle,
    notes,
    pendingDeletionPath,
    sanitizeNoteForSave,
    selectedNotePath,
    setNotes,
    setPendingDeletionPath,
    setPendingSave,
    setRoute,
    setStatusMessage,
    noteService,
    router,
  ]);
}
