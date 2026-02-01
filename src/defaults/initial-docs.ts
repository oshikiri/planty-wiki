type DefaultDocSource = {
  sourcePath: string;
  body: string;
};

const rawDocs = import.meta.glob("../../docs/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

export const DEFAULT_INDEX_MARKDOWN = rawDocs["../../docs/index.md"] ?? "";
export const DEFAULT_DOC_SOURCES: DefaultDocSource[] = Object.entries(rawDocs)
  .filter(([sourcePath]) => !sourcePath.includes("/docs/journals/"))
  .map(([sourcePath, body]) => ({
    sourcePath,
    body: body ?? "",
  }));

export type { DefaultDocSource };
