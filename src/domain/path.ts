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
