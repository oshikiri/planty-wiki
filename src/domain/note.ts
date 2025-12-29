import { normalizePath } from "../navigation";

export interface Note {
  path: string;
  title: string;
  body: string;
  updatedAt?: string;
}

export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
}

export type NoteInput = {
  path: string;
  title?: string | null;
  body?: string | null;
  updatedAt?: string | null;
};

/**
 * Converts a NoteInput into a fully normalized Note entity with path normalization and title fallback.
 *
 * @param input Note data prior to persistence
 * @param fallbackTitle Fallback title used when the provided title is empty
 * @returns Normalized Note
 */
export function buildNote(input: NoteInput, fallbackTitle = "untitled"): Note {
  const normalizedPath = normalizePath(input.path);
  const trimmedTitle = input.title?.trim() ?? "";
  const title = trimmedTitle || deriveTitleFromPath(normalizedPath, fallbackTitle);
  const body = typeof input.body === "string" ? input.body : "";
  const updatedAt = input.updatedAt?.trim();
  if (updatedAt) {
    return { path: normalizedPath, title, body, updatedAt };
  }
  return { path: normalizedPath, title, body };
}

/**
 * Derives the title string from the last segment of a note path, falling back when empty.
 *
 * @param path Note path
 * @param fallback Title used when the path has no segments
 * @returns Last segment or the fallback
 */
export function deriveTitleFromPath(path: string, fallback = "untitled"): string {
  const segments = path.split("/").filter(Boolean);
  return segments.slice(-1)[0] ?? fallback;
}
