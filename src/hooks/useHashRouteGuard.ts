import { useEffect, type Dispatch, type MutableRef, type StateUpdater } from "preact/hooks";

import type { Note } from "../types/note";
import type { Route } from "../navigation/route";
import type { Router } from "../navigation/router";

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
    const handleHashChange = async () => {
      const routeFromHash = router.getCurrentRoute();
      const latestNotes = notesRef.current;
      if (!routeFromHash) {
        return;
      }
      if (routeFromHash.type === "query") {
        setRoute(routeFromHash);
        return;
      }
      if (!latestNotes.length) return;
      const next = routeFromHash.path;

      // notesトリガで登録すると大量に呼び出されてパフォーマンスが落ちるため、マウント/アンマウント時のみ走るように定義する
      const exists = latestNotes.some((note) => note.path === next);
      if (!exists) {
        const title = deriveTitle(next);
        const newNote = sanitizeNoteForSave({ path: next, title, body: "" });
        setNotes((prev) => [...prev, newNote]);
        try {
          await saveNote(newNote);
        } catch (error) {
          console.error("Failed to create note via hashchange", error);
          setStatusMessage("Failed to create note from hash");
        }
      }
      setRoute(routeFromHash);
    };

    handleHashChange().catch((error) => {
      console.error("Failed to handle initial hash route", error);
    });

    const unsubscribe = router.subscribe(() => {
      handleHashChange().catch((error) => {
        console.error("Failed to handle hash route change", error);
      });
    });

    return () => {
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
