import { useEffect, useMemo, useState } from "preact/hooks";

import { extractWikiLinks } from "../navigation";
import type { Note } from "../types/note";
import type { NoteService } from "../services/note-service";

export type Backlink = {
  path: string;
  title: string;
  snippet: string;
};

/**
 * Retrieves pages that reference the current note, delegating to the storage index when available and falling back to a local scan otherwise.
 *
 * @param notes List of notes held on the client
 * @param current Note currently being edited
 * @param noteService NoteService that exposes backlink APIs (optional)
 * @returns Array of Backlink objects
 */
export function useBacklinks(notes: Note[], current: Note, noteService?: NoteService): Backlink[] {
  const targetPath = current.path;
  const canUseIndexedBacklinks = Boolean(noteService?.listBacklinks);
  const [indexedBacklinks, setIndexedBacklinks] = useState<Backlink[] | null>(null);
  const fallbackBacklinks = useMemo(
    () => (canUseIndexedBacklinks ? [] : buildBacklinksFromNotes(notes, targetPath)),
    [canUseIndexedBacklinks, notes, targetPath],
  );

  useEffect(() => {
    if (!canUseIndexedBacklinks || !noteService?.listBacklinks) {
      setIndexedBacklinks(null);
      return;
    }
    let isCancelled = false;
    const fetchBacklinks = async () => {
      try {
        const linkingNotes = await noteService.listBacklinks(targetPath);
        if (isCancelled) return;
        setIndexedBacklinks(buildBacklinksFromNotes(linkingNotes, targetPath));
      } catch (error) {
        console.error("Failed to load backlinks from storage. Falling back to local scan.", error);
        if (isCancelled) return;
        setIndexedBacklinks(buildBacklinksFromNotes(notes, targetPath));
      }
    };
    fetchBacklinks();
    return () => {
      isCancelled = true;
    };
  }, [canUseIndexedBacklinks, notes, noteService, targetPath]);

  if (canUseIndexedBacklinks && indexedBacklinks) {
    return indexedBacklinks;
  }
  return fallbackBacklinks;
}

function buildBacklinksFromNotes(sourceNotes: Note[], targetPath: string): Backlink[] {
  if (!sourceNotes.length) {
    return [];
  }
  const results: Backlink[] = [];
  for (const note of sourceNotes) {
    if (note.path === targetPath) {
      continue;
    }
    if (!note.body.includes("[[")) {
      continue;
    }
    const links = extractWikiLinks(note.body);
    const match = links.find((link) => link.path === targetPath);
    if (!match) {
      continue;
    }
    const snippet = createSnippet(note.body, match.display);
    results.push({
      path: note.path,
      title: note.title,
      snippet,
    });
  }
  return results;
}

function createSnippet(body: string, display: string): string {
  const marker = `[[${display}]]`;
  const index = body.indexOf(marker);
  if (index === -1) {
    const snippet = body.slice(0, 120);
    return snippet.replace(/\s+/g, " ").trim();
  }
  const start = findParagraphStart(body, index);
  const end = findParagraphEnd(body, index + marker.length);
  const snippet = body.slice(start, end);
  return snippet.trim();
}

function findParagraphStart(body: string, index: number): number {
  const blankLinePattern = /\r?\n\r?\n/g;
  let lastMatchEnd = 0;
  while (true) {
    const match = blankLinePattern.exec(body);
    if (!match || match.index >= index) {
      break;
    }
    lastMatchEnd = match.index + match[0].length;
  }
  return lastMatchEnd;
}

function findParagraphEnd(body: string, offset: number): number {
  const blankLinePattern = /\r?\n\r?\n/g;
  blankLinePattern.lastIndex = offset;
  const match = blankLinePattern.exec(body);
  return match ? match.index : body.length;
}
