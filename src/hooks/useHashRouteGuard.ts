import { useEffect, type Dispatch, type MutableRef, type StateUpdater } from "preact/hooks";

import type { Note } from "../types/note";
import type { Route } from "../navigation/route";
import type { Router } from "../navigation/router";
import { handleHashRouteChange } from "../usecases/hashRouteGuard";

type UseHashRouteGuardParams = {
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  setRoute: Dispatch<StateUpdater<Route>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  saveNote: (note: Note) => Promise<void>;
  notesRef: MutableRef<Note[]>;
  router: Router;
};

/**
 * useHashRouteGuardはhashchangeイベントを監視し、指定パスが存在しなければ作成して遷移させる。
 *
 * @param params ノート配列refや保存関数などハッシュ監視に必要な依存
 * @returns void
 */
export function useHashRouteGuard({
  deriveTitle,
  sanitizeNoteForSave,
  setNotes,
  setRoute,
  setStatusMessage,
  saveNote,
  notesRef,
  router,
}: UseHashRouteGuardParams) {
  useEffect(() => {
    const abortController = new AbortController();

    const runHandler = () =>
      handleHashRouteChange({
        deriveTitle,
        sanitizeNoteForSave,
        setNotes,
        setRoute,
        setStatusMessage,
        saveNote,
        notesRef,
        router,
        signal: abortController.signal,
      }).catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }
        console.error("Failed to handle hash route change", error);
        setStatusMessage("Failed to handle hash route");
      });

    runHandler();
    const unsubscribe = router.subscribe(runHandler);

    return () => {
      abortController.abort();
      unsubscribe();
    };
  }, [
    deriveTitle,
    notesRef,
    router,
    sanitizeNoteForSave,
    setNotes,
    setRoute,
    setStatusMessage,
    saveNote,
  ]);
}
