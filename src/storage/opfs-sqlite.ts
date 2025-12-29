import type { NoteStorage } from "./index";
import type { Note, SearchResult } from "../types/note";
import { callWorker } from "./sqlite-worker-client";

/**
 * Creates a NoteStorage implementation that talks to the SQLite worker on OPFS.
 *
 * @returns NoteStorage backed by SQLite
 */
export function createSqliteStorage(): NoteStorage {
  return {
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
    async searchNotes(query: string): Promise<SearchResult[]> {
      const trimmed = query.trim();
      if (!trimmed) {
        return [];
      }
      try {
        const result = (await callWorker<SearchResult[]>("searchNotes", { query: trimmed })) ?? [];
        if (Array.isArray(result)) {
          return result.map((row) => ({
            path: row.path,
            title: row.title,
            snippet: row.snippet,
          }));
        }
        return [];
      } catch (error) {
        console.warn(
          "Failed to search notes via SQLite worker. Falling back to empty result.",
          error,
        );
        return [];
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
