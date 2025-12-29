import { useEffect, useState, type Dispatch, type StateUpdater } from "preact/hooks";

import type { Note, PendingSave } from "../types/note";

type UseAutoSaveParams = {
  pendingSave: PendingSave | null;
  sanitizeNoteForSave: (note: Note) => Note;
  setPendingSave: Dispatch<StateUpdater<PendingSave | null>>;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  saveNote: (note: Note) => Promise<void>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
};

/**
 * Observes pendingSave/retrySnapshot and runs sanitize → UI update → persistence after 800 ms.
 * Failed saves are captured in a retry state so the next effect cycle can reattempt the same work.
 *
 * @param params Dependencies required for auto-save such as pendingSave and saveNote
 * @returns void
 */
export function useAutoSave({
  pendingSave,
  sanitizeNoteForSave,
  setPendingSave,
  setNotes,
  saveNote,
  setStatusMessage,
}: UseAutoSaveParams) {
  // Keep failed saves in retrySnapshot, independent from pendingSave, so they can be retried once storage recovers.
  const [retrySnapshot, setRetrySnapshot] = useState<PendingSave | null>(null);

  useEffect(() => {
    return scheduleAutoSaveEffect({
      snapshot: retrySnapshot ?? pendingSave,
      isRetrying: Boolean(retrySnapshot),
      sanitizeNoteForSave,
      setPendingSave,
      setNotes,
      saveNote,
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
    saveNote,
  ]);
}

/**
 * Internal parameters that shape the auto-save loop; introduced to clarify responsibilities inside useEffect.
 */
type ScheduleParams = {
  snapshot: PendingSave | null;
  isRetrying: boolean;
  sanitizeNoteForSave: (note: Note) => Note;
  setPendingSave: Dispatch<StateUpdater<PendingSave | null>>;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  saveNote: (note: Note) => Promise<void>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  setRetrySnapshot: Dispatch<StateUpdater<PendingSave | null>>;
};

/**
 * Schedules the 800 ms delayed auto-save and clears the timeout during cleanup.
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
 * Runs sanitize → UI update → storage persistence → success/failure handling as a single task.
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
  saveNote,
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
    await saveNote(nextNote);
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
