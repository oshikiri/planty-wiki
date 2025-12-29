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
  const normalized = normalizePath(path);
  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length) {
    return "#/";
  }
  const encodedSegments = segments.map((segment) => encodeURIComponent(segment));
  return `#/${encodedSegments.join("/")}`;
}

/**
 * Normalizes a path into a safe absolute form such as `/pages/foo`, resolving `.` and `..`.
 *
 * @param path Raw path from user input or wiki link
 * @returns Normalized absolute path, defaulting to `/` when empty
 */
export function normalizePath(path: string): string {
  const decoded = ensureLeadingSlash(path);
  const trimmed = trimTrailingSlashes(decoded);
  const normalizedSlashes = normalizeSeparators(trimmed);
  const normalizedSegments = buildNormalizedSegments(normalizedSlashes);
  if (!normalizedSegments.length) {
    return "/";
  }
  return `/${normalizedSegments.join("/")}`;
}

function ensureLeadingSlash(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

/**
 * Removes trailing slashes except for the root `/`.
 */
function trimTrailingSlashes(value: string): string {
  if (value === "/") {
    return value;
  }
  return value.replace(/\/+$/, "");
}

/**
 * Replaces Windows-style backslashes with forward slashes.
 */
function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, "/");
}

/**
 * Resolves "." and ".." segments while dropping empty parts to produce a safe segment array.
 */
function buildNormalizedSegments(value: string): string[] {
  const segments = value.split("/");
  const normalizedSegments: string[] = [];
  for (const rawSegment of segments) {
    if (!rawSegment || rawSegment === ".") {
      continue;
    }
    if (rawSegment === "..") {
      normalizedSegments.pop();
      continue;
    }
    const sanitized = sanitizePathSegment(rawSegment);
    if (!sanitized || sanitized === ".") {
      continue;
    }
    if (sanitized === "..") {
      normalizedSegments.pop();
      continue;
    }
    normalizedSegments.push(sanitized);
  }
  return normalizedSegments;
}

/**
 * Removes control characters and slashes while preserving Unicode characters in the segment.
 */
function sanitizePathSegment(segment: string): string {
  let result = "";
  for (const char of segment) {
    const code = char.codePointAt(0);
    if (!code) continue;
    if (code <= 0x1f || char === "/") {
      continue;
    }
    result += char;
  }
  return result.trim();
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
      const normalized = normalizePath(`/pages/${text}`);
      return { normalized, display: text };
    })
    .map(({ normalized, display }) => ({
      path: normalized,
      display,
    }));
}
