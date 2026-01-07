import type { NoteStorage } from "./index";
import type { Note, NoteSummary } from "../types/note";
import { callWorker } from "./sqlite-worker-client";

/**
 * Creates a NoteStorage implementation that talks to the SQLite worker on OPFS.
 *
 * @returns NoteStorage backed by SQLite
 */
export function createSqliteStorage(): NoteStorage {
  return {
    async loadNoteSummaries(): Promise<NoteSummary[]> {
      try {
        const result =
          (await callWorker<NoteSummary[]>("loadNoteSummaries"))?.filter(Boolean) ?? [];
        return result;
      } catch (error) {
        console.error("Failed to load note summaries from SQLite worker.", error);
        throw error;
      }
    },
    async loadNote(path: Note["path"]): Promise<Note | null> {
      if (!path) {
        return null;
      }
      try {
        const result = await callWorker<Note | null>("loadNote", { path });
        if (!result) {
          return null;
        }
        return {
          path: result.path,
          title: result.title,
          body: result.body,
          updatedAt: result.updatedAt,
        };
      } catch (error) {
        console.error("Failed to load note from SQLite worker.", error);
        throw error;
      }
    },
    async loadNotes(): Promise<Note[]> {
      try {
        const result = (await callWorker<Note[]>("loadNotes")) ?? [];
        const notes = Array.isArray(result) ? result : [];
        if (notes.length > 0) {
          return notes;
        }
        return [];
      } catch (error) {
        console.error("Failed to load notes from SQLite worker.", error);
        throw error;
      }
    },
    async saveNote(updated: Note): Promise<void> {
      try {
        await callWorker<void>("saveNote", updated);
      } catch (error) {
        console.error("Failed to save note to SQLite worker.", error);
        throw error;
      }
    },
    async deleteNote(path: Note["path"]): Promise<void> {
      try {
        await callWorker<void>("deleteNote", { path });
      } catch (error) {
        console.error("Failed to delete note from SQLite worker.", error);
        throw error;
      }
    },
    async importNotes(notes: Note[]): Promise<void> {
      if (!notes.length) {
        return;
      }
      try {
        await callWorker<void>("bulkSaveNotes", notes);
      } catch (error) {
        console.error("Failed to import notes to SQLite worker.", error);
        throw error;
      }
    },
    async listBacklinks(targetPath: Note["path"]): Promise<Note[]> {
      if (!targetPath) {
        return [];
      }
      try {
        const result = (await callWorker<Note[]>("listBacklinks", { path: targetPath })) ?? [];
        if (Array.isArray(result)) {
          return result.filter((note): note is Note => Boolean(note?.path));
        }
        return [];
      } catch (error) {
        console.error("Failed to load backlinks from SQLite worker.", error);
        return [];
      }
    },
  };
}
