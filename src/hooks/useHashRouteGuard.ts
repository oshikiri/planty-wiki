import { useEffect, type Dispatch, type MutableRef, type StateUpdater } from "preact/hooks";

import type { Note } from "../types/note";
import { parseHashLocation, type Route } from "../navigation/route";

type UseHashRouteGuardParams = {
  deriveTitle: (path: string) => string;
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  setRoute: Dispatch<StateUpdater<Route>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  saveNote: (note: Note) => Promise<void>;
  notesRef: MutableRef<Note[]>;
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
}: UseHashRouteGuardParams) {
  useEffect(() => {
    const handleHashChange = async () => {
      const routeFromHash = parseHashLocation(window.location.hash);
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

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [deriveTitle, notesRef, sanitizeNoteForSave, setNotes, setRoute, setStatusMessage, saveNote]);
}
