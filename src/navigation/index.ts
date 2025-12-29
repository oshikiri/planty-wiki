import { normalizePath as normalizeNotePath } from "../domain/path";

export { normalizePath } from "../domain/path";

export type WikiLink = {
  path: string;
  display: string;
};

/**
 * Formats a note path into a `#/pages/foo`-style hash while encoding each segment.
 *
 * @param path Absolute note path
 * @returns String assignable to window.location.hash
 */
export function formatHashFromPath(path: string): string {
  const normalized = normalizeNotePath(path);
  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length) {
    return "#/";
  }
  const encodedSegments = segments.map((segment) => encodeURIComponent(segment));
  return `#/${encodedSegments.join("/")}`;
}

/**
 * Extracts `[[Label]]` wiki links from Markdown and returns them without duplicates.
 *
 * @param body Markdown body that may contain wiki links
 * @returns Array of links containing path and display text
 */
export function extractWikiLinks(body: string): WikiLink[] {
  const matches = [...body.matchAll(/\[\[([^[\]]+)\]\]/g)];
  const seen = new Set<string>();
  return matches
    .map((match) => match[1].trim())
    .filter((text) => text.length > 0)
    .filter((text) => {
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    })
    .map((text) => {
      const normalized = normalizeNotePath(`/pages/${text}`);
      return { normalized, display: text };
    })
    .map(({ normalized, display }) => ({
      path: normalized,
      display,
    }));
}
