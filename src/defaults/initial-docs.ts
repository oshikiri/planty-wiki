import { normalizePath } from "../domain/path";
import type { BundledDoc } from "../domain/bundled-doc";

type DefaultDocSource = {
  sourcePath: string;
  body: string;
};

const rawDocs = import.meta.glob("../../docs/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

export const DEFAULT_README_MARKDOWN = rawDocs["../../docs/README.md"] ?? "";
const DEFAULT_DOC_SOURCES: DefaultDocSource[] = Object.entries(rawDocs)
  .filter(([sourcePath]) => !sourcePath.includes("/docs/journals/"))
  .map(([sourcePath, body]) => ({
    sourcePath,
    body: body ?? "",
  }));

const BUNDLED_DOC_BODIES_BY_PATH = buildBundledDocBodiesByPath(DEFAULT_DOC_SOURCES);

/**
 * Resolves the bundled markdown body for a note path when the path matches a built-in docs page.
 *
 * @param path Note path to resolve
 * @returns Bundled markdown body, or null when the path is not a built-in docs page
 */
export function resolveBundledDocBody(path: string): string | null {
  return BUNDLED_DOC_BODIES_BY_PATH.get(normalizePath(path)) ?? null;
}

/** Computes the bundled revision of each page independently of user edits. */
export async function loadBundledDocs(): Promise<BundledDoc[]> {
  return Promise.all(
    [...BUNDLED_DOC_BODIES_BY_PATH].map(async ([path, body]) => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
      const hash = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      return { path, body, hash };
    }),
  );
}

function buildBundledDocBodiesByPath(sources: DefaultDocSource[]): Map<string, string> {
  const bodiesByPath = new Map<string, string>();
  for (const source of sources) {
    const notePath = mapDocSourceToPath(source.sourcePath);
    if (!notePath || bodiesByPath.has(notePath)) {
      continue;
    }
    bodiesByPath.set(notePath, source.body);
  }
  return bodiesByPath;
}

function mapDocSourceToPath(sourcePath: string): string | null {
  const match = sourcePath.match(/\/docs\/(.+)\.md$/);
  if (!match) {
    return null;
  }
  const relativePath = match[1];
  return normalizePath(`/pages/${relativePath}`);
}
