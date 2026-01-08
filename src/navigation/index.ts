import { normalizePath as normalizeNotePath } from "../domain/path";

export { normalizePath } from "../domain/path";

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
