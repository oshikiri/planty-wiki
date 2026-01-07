import type { Note, NoteSummary, SearchResult } from "../types/note";
import { createSqliteStorage } from "./opfs-sqlite";

export interface NoteStorage {
  loadNoteSummaries: () => Promise<NoteSummary[]>;
  loadNote: (path: Note["path"]) => Promise<Note | null>;
  loadNotes: () => Promise<Note[]>;
  saveNote: (note: Note) => Promise<void>;
  deleteNote: (path: Note["path"]) => Promise<void>;
  importNotes: (notes: Note[]) => Promise<void>;
  searchNotes?: (query: string) => Promise<SearchResult[]>;
  listBacklinks: (targetPath: Note["path"]) => Promise<Note[]>;
}

/**
 * Initializes the OPFS + SQLite (worker-based) storage and throws if the environment cannot support it.
 *
 * @returns NoteStorage backed by OPFS SQLite
 */
export function createStorage(): NoteStorage {
  const hasNavigator = typeof navigator !== "undefined";
  const hasOpfs =
    hasNavigator &&
    Boolean(
      (navigator as unknown as { storage?: { getDirectory?: () => unknown } }).storage
        ?.getDirectory,
    );

  if (!hasOpfs) {
    reportStorageInitIssue(
      "OPFS is not available in this browser. Planty Wiki cannot keep notes across reloads.",
    );
  }

  const disableSqlite = import.meta?.env?.VITE_USE_SQLITE === "false";
  const canUseWorkerSqlite =
    !disableSqlite &&
    typeof Worker !== "undefined" &&
    typeof SharedArrayBuffer !== "undefined" &&
    (globalThis as typeof globalThis & { crossOriginIsolated?: boolean }).crossOriginIsolated ===
      true;

  if (!canUseWorkerSqlite) {
    reportStorageInitIssue(
      "Required browser features (SharedArrayBuffer / crossOriginIsolated) are missing, so the OPFS worker cannot start.",
    );
  }

  console.info("Using SQLite on OPFS storage backend via worker");
  return createSqliteStorage();
}

function reportStorageInitIssue(message: string): never {
  const formatted = `Storage initialization failed: ${message}`;
  console.error(formatted);
  if (typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(formatted);
  }
  throw new Error(formatted);
}
