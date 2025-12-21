import { useEffect, useState, type Dispatch, type StateUpdater } from "preact/hooks";

import type { Note, PendingSave } from "../types/note";

type UseAutoSaveParams = {
  pendingSave: PendingSave | null;
  sanitizeNoteForSave: (note: Note) => Note;
  setPendingSave: Dispatch<StateUpdater<PendingSave | null>>;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  storageSave: (note: Note) => Promise<void>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
};

/**
 * useAutoSaveは、pendingSaveまたはretrySnapshotを監視し、800ms後にsanitize→UIアップデート→storageSaveを順に実行する。
 * 保存が失敗した場合はretry専用stateへ差分を残し、次のeffectサイクルで同じ処理を再試行する。
 *
 * @param params pendingSaveやストレージ保存関数など自動保存に必要な依存関係
 * @returns void
 */
export function useAutoSave({
  pendingSave,
  sanitizeNoteForSave,
  setPendingSave,
  setNotes,
  storageSave,
  setStatusMessage,
}: UseAutoSaveParams) {
  // pendingSaveと独立したretrySnapshotで保存失敗分を保持し、ストレージ復旧後に再実行できるようにする
  const [retrySnapshot, setRetrySnapshot] = useState<PendingSave | null>(null);

  useEffect(() => {
    return scheduleAutoSaveEffect({
      snapshot: retrySnapshot ?? pendingSave,
      isRetrying: Boolean(retrySnapshot),
      sanitizeNoteForSave,
      setPendingSave,
      setNotes,
      storageSave,
      setStatusMessage,
      setRetrySnapshot,
    });
  }, [
    pendingSave,
    retrySnapshot,
    sanitizeNoteForSave,
    setNotes,
    setPendingSave,
    setStatusMessage,
    storageSave,
  ]);
}

/**
 * 自動保存ループを構築する内部パラメータ群。useEffectを細分化して責務を明確にするために導入した。
 */
type ScheduleParams = {
  snapshot: PendingSave | null;
  isRetrying: boolean;
  sanitizeNoteForSave: (note: Note) => Note;
  setPendingSave: Dispatch<StateUpdater<PendingSave | null>>;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  storageSave: (note: Note) => Promise<void>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  setRetrySnapshot: Dispatch<StateUpdater<PendingSave | null>>;
};

/**
 * 800ms遅延の自動保存処理をスケジュールし、cleanupでtimeoutを破棄する。
 */
function scheduleAutoSaveEffect(params: ScheduleParams) {
  const { snapshot } = params;
  if (!snapshot) {
    return;
  }
  const timeoutId = window.setTimeout(() => {
    const taskParams: TaskParams = {
      ...params,
      snapshot,
    };
    void runAutoSaveTask(taskParams);
  }, 800);
  return () => {
    window.clearTimeout(timeoutId);
  };
}

/**
 * sanitize→UI更新→storage保存→成功/失敗ハンドリングまでを一連で実行する。
 */
type TaskParams = ScheduleParams & {
  snapshot: PendingSave;
};

async function runAutoSaveTask({
  snapshot,
  isRetrying,
  sanitizeNoteForSave,
  setPendingSave,
  setNotes,
  storageSave,
  setStatusMessage,
  setRetrySnapshot,
}: TaskParams) {
  if (!isRetrying) {
    clearPendingSnapshot(snapshot, setPendingSave);
  }
  const nextNote = sanitizeNoteForSave({
    path: snapshot.path,
    title: snapshot.title,
    body: snapshot.body,
    updatedAt: new Date().toISOString(),
  });
  setNotes((prev) => upsertNote(prev, nextNote));
  try {
    await storageSave(nextNote);
    setStatusMessage("Auto-saved changes");
    if (isRetrying) {
      clearRetrySnapshot(snapshot, setRetrySnapshot);
    }
  } catch (error) {
    console.error("Failed to persist note via save queue", error);
    setStatusMessage("Failed to auto-save changes");
    queueSnapshotForRetry(snapshot, setRetrySnapshot);
  }
}

function upsertNote(notes: Note[], nextNote: Note): Note[] {
  const index = notes.findIndex((note) => note.path === nextNote.path);
  if (index === -1) {
    return [...notes, nextNote];
  }
  const copy = [...notes];
  copy[index] = nextNote;
  return copy;
}

function clearPendingSnapshot(
  snapshot: PendingSave,
  setPendingSave: Dispatch<StateUpdater<PendingSave | null>>,
) {
  setPendingSave((current) => {
    if (current && snapshotsMatch(current, snapshot)) {
      return null;
    }
    return current;
  });
}

function clearRetrySnapshot(
  snapshot: PendingSave,
  setRetrySnapshot: Dispatch<StateUpdater<PendingSave | null>>,
) {
  setRetrySnapshot((current) => {
    if (current && snapshotsMatch(current, snapshot)) {
      return null;
    }
    return current;
  });
}

function queueSnapshotForRetry(
  snapshot: PendingSave,
  setRetrySnapshot: Dispatch<StateUpdater<PendingSave | null>>,
) {
  setRetrySnapshot(() => cloneSnapshot(snapshot));
}

function snapshotsMatch(target: PendingSave | null, snapshot: PendingSave): boolean {
  if (!target) {
    return false;
  }
  return (
    target.path === snapshot.path &&
    target.title === snapshot.title &&
    target.body === snapshot.body
  );
}

function cloneSnapshot(snapshot: PendingSave): PendingSave {
  return {
    path: snapshot.path,
    title: snapshot.title,
    body: snapshot.body,
  };
}
