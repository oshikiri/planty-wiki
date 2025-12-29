import { useCallback, type Dispatch, type StateUpdater } from "preact/hooks";

import { normalizePath } from "../navigation";
import type { Route } from "../navigation/route";
import type { Note } from "../types/note";
import type { NoteService } from "../services/note-service";
import type { Router } from "../navigation/router";

export type UseSelectPathHandlerParams = {
  defaultPage: string;
  deriveTitle: (path: string) => string;
  notes: Note[];
  sanitizeNoteForSave: (note: Note) => Note;
  setDraftBody: Dispatch<StateUpdater<string>>;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  setRoute: Dispatch<StateUpdater<Route>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  noteService: NoteService;
  router: Router;
};

/**
 * useSelectPathHandlerはノート選択と必要に応じた新規作成を行うコールバックを返し、App側のハンドラを整理する。
 *
 * @param params defaultPageやストレージ依存など選択処理に必要な値
 * @returns パスを受け取り選択・作成を行うコールバック
 */
export function useSelectPathHandler({
  defaultPage,
  deriveTitle,
  notes,
  sanitizeNoteForSave,
  setDraftBody,
  setNotes,
  setRoute,
  setStatusMessage,
  noteService,
  router,
}: UseSelectPathHandlerParams) {
  return useCallback(
    (path: string) => {
      const run = async () => {
        const normalized = path ? normalizePath(path) : defaultPage;
        const existingNote = notes.find((note) => note.path === normalized);
        let nextBody = existingNote?.body ?? "";
        if (!existingNote) {
          const title = deriveTitle(normalized);
          const newNote = sanitizeNoteForSave({ path: normalized, title, body: "" });
          setNotes((prev) => [...prev, newNote]);
          try {
            await noteService.saveNote(newNote);
          } catch (error) {
            console.error("Failed to create note via handleSelectPath", error);
            setStatusMessage("Failed to create note");
          }
          nextBody = newNote.body;
        }
        const nextRoute: Route = { type: "note", path: normalized };
        setRoute(nextRoute);
        setDraftBody(nextBody);
        router.navigate(nextRoute);
      };
      run().catch((error) => {
        console.error("Unhandled error during handleSelectPath", error);
        setStatusMessage("Failed to select note");
      });
    },
    [
      defaultPage,
      deriveTitle,
      notes,
      sanitizeNoteForSave,
      setDraftBody,
      setNotes,
      setRoute,
      setStatusMessage,
      noteService,
      router,
    ],
  );
}
