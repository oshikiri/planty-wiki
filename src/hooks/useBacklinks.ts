import { useEffect, useState } from "preact/hooks";

import type { Note } from "../types/note";
import type { NoteService } from "../services/note-service";

export type Backlink = {
  path: string;
  title: string;
  snippet: string;
};

/**
 * Retrieves pages that reference the current note using the storage backlink index.
 *
 * @param current Note currently being edited
 * @param noteService NoteService that exposes backlink APIs (optional)
 * @returns Array of Backlink objects
 */
export function useBacklinks(current: Note, noteService?: NoteService): Backlink[] {
  const targetPath = current.path;
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);

  useEffect(() => {
    if (!noteService?.listBacklinks || !targetPath) {
      setBacklinks([]);
      return;
    }
    let isCancelled = false;
    const fetchBacklinks = async () => {
      try {
        const linkingNotes = await noteService.listBacklinks(targetPath);
        if (isCancelled) return;
        setBacklinks(
          linkingNotes.map((note) => ({
            path: note.path,
            title: note.title,
            snippet: buildSnippet(note.body, current.title),
          })),
        );
      } catch (error) {
        console.error("Failed to load backlinks from storage.", error);
        if (isCancelled) return;
        setBacklinks([]);
      }
    };
    fetchBacklinks();
    return () => {
      isCancelled = true;
    };
  }, [current.title, noteService, targetPath]);

  return backlinks;
}

function buildSnippet(body: string, display: string): string {
  const marker = `[[${display}]]`;
  const index = body.indexOf(marker);
  if (index === -1) {
    return body.slice(0, 120).replace(/\s+/g, " ").trim();
  }
  const start = findParagraphBoundary(body, index, "start");
  const end = findParagraphBoundary(body, index + marker.length, "end");
  return body.slice(start, end).trim();
}

function findParagraphBoundary(body: string, position: number, type: "start" | "end"): number {
  const blankLinePattern = /\r?\n\r?\n/g;
  if (type === "start") {
    let lastMatchEnd = 0;
    while (true) {
      const match = blankLinePattern.exec(body);
      if (!match || match.index >= position) {
        break;
      }
      lastMatchEnd = match.index + match[0].length;
    }
    return lastMatchEnd;
  }
  blankLinePattern.lastIndex = position;
  const match = blankLinePattern.exec(body);
  return match ? match.index : body.length;
}
