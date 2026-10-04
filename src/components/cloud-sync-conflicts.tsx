import { useCallback, useEffect, useState } from "preact/hooks";
import type { NoteService } from "../services/note-service";
import type { SyncConflict } from "../types/sync";
import styles from "./sidebar.module.css";

type ConflictProps = {
  canResolve: boolean;
  onResolve: (noteId: string, choice: "local" | "server", path?: string) => Promise<void>;
};

/**
 * Displays stored conflicts and allows version selection or renaming a conflicting path.
 *
 * @param props Note service and conflict resolution callbacks
 * @returns Conflict controls, or null when no conflicts exist
 */
export function CloudSyncConflicts(props: ConflictProps & { noteService: NoteService }) {
  const { conflicts, refresh } = useSyncConflicts(props.noteService);
  if (!conflicts.length) return null;
  return (
    <section class={styles.syncConflicts} aria-label="Cloud Sync conflicts">
      <strong>Cloud Sync conflicts</strong>
      {!props.canResolve ? <small>Wait for local changes to finish saving.</small> : null}
      {conflicts.map((conflict) => (
        <ConflictItem
          key={`conflict:${conflict.noteId}`}
          conflict={conflict}
          canResolve={props.canResolve}
          onResolve={props.onResolve}
          onResolved={refresh}
        />
      ))}
    </section>
  );
}

function ConflictItem({
  conflict,
  canResolve,
  onResolve,
  onResolved,
}: ConflictProps & {
  conflict: SyncConflict;
  onResolved: () => void;
}) {
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resolve = async (choice: "local" | "server") => {
    if (!canResolve || busy) return;
    if (
      !conflict.server &&
      choice === "server" &&
      !window.confirm("Discard this local note and its pending changes?")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await onResolve(
        conflict.noteId,
        choice,
        !conflict.server && choice === "local" ? path : undefined,
      );
      onResolved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to resolve this conflict");
    } finally {
      setBusy(false);
    }
  };
  const disabled = !canResolve || busy;
  return (
    <article class={styles.syncConflict}>
      <span>{conflict.local.path}</span>
      <small>
        {conflict.server
          ? "Local and server versions differ."
          : "Keep the local note at a different path, or discard it."}
      </small>
      <ConflictPreview conflict={conflict} />
      {!conflict.server && !conflict.local.deleted ? (
        <label>
          New page path
          <input
            value={path}
            placeholder="/pages/new-name"
            disabled={disabled}
            onInput={(event) => setPath(event.currentTarget.value)}
          />
        </label>
      ) : null}
      <div class={styles.syncConflictActions}>
        <button
          type="button"
          onClick={() => void resolve("local")}
          disabled={disabled || (!conflict.server && (!path || conflict.local.deleted))}
        >
          {conflict.server ? "Keep local" : "Save at new path"}
        </button>
        <button type="button" onClick={() => void resolve("server")} disabled={disabled}>
          {conflict.server ? "Use server" : "Discard local"}
        </button>
      </div>
      {error ? <output role="alert">{error}</output> : null}
    </article>
  );
}

function ConflictPreview({ conflict }: { conflict: SyncConflict }) {
  return (
    <details class={styles.syncConflictPreview}>
      <summary>Compare versions</summary>
      <strong>Local</strong>
      <pre>{conflict.local.deleted ? "[Deleted]" : conflict.local.body}</pre>
      {conflict.server ? (
        <>
          <strong>Server</strong>
          <pre>{conflict.server.deleted ? "[Deleted]" : conflict.server.body}</pre>
        </>
      ) : null}
    </details>
  );
}

function useSyncConflicts(noteService: NoteService) {
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const refresh = useCallback(() => {
    void noteService
      .loadSyncConflicts()
      .then(setConflicts)
      .catch((error) => {
        console.error("Failed to load Cloud Sync conflicts", error);
      });
  }, [noteService]);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    const unsubscribe = noteService.subscribeToChanges(refresh);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [noteService, refresh]);
  return { conflicts, refresh };
}
