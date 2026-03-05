import { formatHashFromPath, normalizePath } from "./index";
import { QUERY_PAGE_PATH } from "./constants";

export type Route = { type: "note"; path: string } | { type: "query" };

export const QUERY_ROUTE: Route = { type: "query" };

/**
 * Restores a Route from a location.hash string, returning null when no route is specified.
 *
 * @param hash Hash string read from window.location.hash
 * @returns Null when the hash is empty
 */
export function parseHashLocation(hash: string): Route | null {
  const decoded = decodeHash(hash);
  if (!decoded) {
    return null;
  }
  const normalized = normalizePath(decoded);
  if (normalized === QUERY_PAGE_PATH) {
    return { type: "query" };
  }
  return { type: "note", path: normalized };
}

/**
 * Generates a window.location.hash-friendly string for the given Route.
 *
 * @param route Destination route
 * @returns Hash string formatted as `#/pages/...`
 */
export function formatHashLocation(route: Route): string {
  if (route.type === "query") {
    return formatHashFromPath(QUERY_PAGE_PATH);
  }
  return formatHashFromPath(route.path);
}

/**
 * Decodes a hash string (with `#`) back into a raw string.
 *
 * @param hash Value from window.location.hash
 * @returns Decoded hash, or null when empty
 */
function decodeHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "");
  if (!raw) {
    return null;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
