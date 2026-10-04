import { useEffect, useState } from "preact/hooks";

import { checkCloudSyncAccess, type CloudSyncAccessState } from "../services/cloud-sync-access";
import type { NoteService } from "../services/note-service";
import type { SyncActivityStatus } from "../types/sync";

import styles from "./sidebar.module.css";

const INITIAL_STATE: CloudSyncAccessState | { status: "checking" } = { status: "checking" };

/**
 * Displays the current Cloud Sync access state and the Site authentication links.
 *
 * @returns Cloud Sync access status and authentication actions
 */
export function CloudSyncAccess({ noteService }: { noteService: NoteService }) {
  const [state, setState] = useState<CloudSyncAccessState | { status: "checking" }>(INITIAL_STATE);
  const [syncStatus, setSyncStatus] = useState<SyncActivityStatus>(
    noteService.getSyncActivityStatus(),
  );

  useEffect(() => {
    const unsubscribe = noteService.subscribeToSyncActivity(setSyncStatus);
    let cancelled = false;
    void checkCloudSyncAccess().then((nextState) => {
      if (!cancelled) {
        setState(nextState);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [noteService]);

  if (state.status === "checking") {
    return <output class={styles.cloudSyncStatus}>Checking Cloud Sync access...</output>;
  }

  if (state.status === "authenticated") {
    return (
      <div class={styles.cloudSyncStatus}>
        <span>Cloud Sync ready</span>
        <SyncActivity status={syncStatus} />
        <a href="/signout-with-chatgpt">Sign out</a>
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return (
      <div class={styles.cloudSyncStatus}>
        <span>Sign in to use Cloud Sync</span>
        {syncStatus === "retrying" ? <SyncActivity status={syncStatus} /> : null}
        <a href="/signin-with-chatgpt">Sign in with ChatGPT</a>
      </div>
    );
  }

  return (
    <div class={styles.cloudSyncStatus}>
      <span>Local mode</span>
      {syncStatus === "retrying" ? <SyncActivity status={syncStatus} /> : null}
    </div>
  );
}

function SyncActivity({ status }: { status: SyncActivityStatus }) {
  const label =
    status === "syncing" ? "Syncing..." : status === "synced" ? "Synced" : "Retry pending";
  return (
    <output class={styles.syncActivity} aria-live="polite" aria-label={`Cloud Sync: ${label}`}>
      {label}
    </output>
  );
}
