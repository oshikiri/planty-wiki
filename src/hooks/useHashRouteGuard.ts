import { useEffect, type Dispatch, type MutableRef, type StateUpdater } from "preact/hooks";

import { normalizePath, parseHashPath } from "../navigation";
import type { Note } from "../types/note";

type UseHashRouteGuardParams = {
  deriveTitle: (path: string) => string;
  reservedPaths: string[];
  sanitizeNoteForSave: (note: Note) => Note;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  setSelectedPath: Dispatch<StateUpdater<string>>;
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
  reservedPaths,
  sanitizeNoteForSave,
  setNotes,
  setSelectedPath,
  setStatusMessage,
  saveNote,
  notesRef,
}: UseHashRouteGuardParams) {
  useEffect(() => {
    const handleHashChange = async () => {
      const hashValue = parseHashPath();
      const next = hashValue ? normalizePath(hashValue) : null;
      const latestNotes = notesRef.current;
      if (!next || !latestNotes.length) return;
      if (reservedPaths.includes(next)) {
        setSelectedPath(next);
        return;
      }

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
      setSelectedPath(next);
    };

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [
    deriveTitle,
    reservedPaths,
    notesRef,
    sanitizeNoteForSave,
    setNotes,
    setSelectedPath,
    setStatusMessage,
    saveNote,
  ]);
}
