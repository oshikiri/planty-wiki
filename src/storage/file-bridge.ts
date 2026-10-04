import { normalizePath } from "../navigation";
import type { Note } from "../types/note";
import type { NoteRepository } from "../domain/note-repository";
import { DEFAULT_NOTE_TITLE } from "../domain/note";
import { DIRECTORY_IMPORT_LIMITS } from "../types/sync";

type DirectoryFileEntry = {
  relativePath: string;
  file: File;
};

export type ImportMarkdownResult =
  | { status: "unsupported" }
  | { status: "no-markdown" }
  | { status: "success"; importedCount: number; notes: Note[] }
  | { status: "cancelled" }
  | { status: "limit-exceeded"; limit: "depth" | "files" | "file-size" | "total-size" }
  | { status: "failed" };

export type ExportNotesResult =
  | { status: "unsupported" }
  | { status: "no-notes" }
  | { status: "success"; exportedCount: number }
  | { status: "failed" };

/**
 * Reads Markdown files from a user-selected directory and applies them to the note storage.
 *
 * @param repository Implementation of NoteRepository
 * @param signal Optional cancellation signal for the directory walk and file reads
 * @param onSaving Callback invoked when cancellable reads finish and saving begins
 * @returns Result of the import operation
 */
export async function importMarkdownFromDirectory(
  repository: NoteRepository,
  signal?: AbortSignal,
  onSaving?: () => void,
): Promise<ImportMarkdownResult> {
  const anyWindow = window as typeof window & { showDirectoryPicker?: () => Promise<unknown> };
  if (typeof anyWindow.showDirectoryPicker !== "function") {
    return { status: "unsupported" };
  }
  try {
    const dirHandle =
      (await anyWindow.showDirectoryPicker()) as unknown as FileSystemDirectoryHandle;
    const entries = await collectDirectoryEntries(dirHandle, signal);
    const markdownFiles = entries.filter((entry) =>
      entry.relativePath.toLowerCase().endsWith(".md"),
    );
    if (!markdownFiles.length) {
      return { status: "no-markdown" };
    }
    const importedNotes = await importMarkdownFiles(markdownFiles, signal);
    throwIfAborted(signal);
    onSaving?.();
    await repository.importBatch(importedNotes);
    const updated = await repository.loadAll();
    return {
      status: "success",
      importedCount: importedNotes.length,
      notes: updated,
    };
  } catch (error) {
    if (isAbortError(error, signal)) {
      return { status: "cancelled" };
    }
    if (error instanceof ImportLimitError) {
      return { status: "limit-exceeded", limit: error.limit };
    }
    console.error("Failed to import Markdown notes", error);
    return { status: "failed" };
  }
}

/**
 * Writes the provided notes to a directory chosen by the user as Markdown files.
 *
 * @param notes Array of notes to export
 * @returns Result of the export operation
 */
export async function exportNotesToDirectory(notes: Note[]): Promise<ExportNotesResult> {
  if (!notes.length) {
    return { status: "no-notes" };
  }
  const anyWindow = window as typeof window & { showDirectoryPicker?: () => Promise<unknown> };
  if (typeof anyWindow.showDirectoryPicker !== "function") {
    return { status: "unsupported" };
  }
  try {
    const dirHandle =
      (await anyWindow.showDirectoryPicker()) as unknown as FileSystemDirectoryHandle;
    await exportNotes(notes, dirHandle);
    return { status: "success", exportedCount: notes.length };
  } catch (error) {
    console.error("Failed to export Markdown notes", error);
    return { status: "failed" };
  }
}

function createNoteFromMarkdownPath(relativePath: string, body: string): Note {
  const withoutExt = relativePath.replace(/\.md$/i, "");
  const normalizedPath = withoutExt
    .split(/[\\/]+/)
    .filter(Boolean)
    .join("/");
  const notePath = normalizePath(`/pages/${normalizedPath}`);
  const baseName = normalizedPath.split("/").filter(Boolean).slice(-1)[0] ?? DEFAULT_NOTE_TITLE;
  // Always derive the page title from the file name and never rely on headings inside the body.
  return {
    path: notePath,
    title: baseName,
    body,
    updatedAt: new Date().toISOString(),
  };
}

function toMarkdownRelativePath(notePath: string): string {
  const trimmed = notePath.replace(/^\/+/, "");
  const withoutPrefix = trimmed.startsWith("pages/") ? trimmed.slice("pages/".length) : trimmed;
  if (!withoutPrefix) {
    return "index.md";
  }
  return `${withoutPrefix}.md`;
}

async function collectDirectoryEntries(
  root: FileSystemDirectoryHandle,
  signal?: AbortSignal,
): Promise<DirectoryFileEntry[]> {
  const results: DirectoryFileEntry[] = [];
  let totalBytes = 0;
  async function walkDirectory(dir: FileSystemDirectoryHandle, prefix: string, depth: number) {
    throwIfAborted(signal);
    if (depth > DIRECTORY_IMPORT_LIMITS.maxDepth) {
      throw new ImportLimitError("depth");
    }
    for await (const [name, handle] of dir.entries()) {
      throwIfAborted(signal);
      const nextPath = prefix ? `${prefix}/${name}` : name;
      if ((handle as FileSystemFileHandle).kind === "file") {
        if (results.length >= DIRECTORY_IMPORT_LIMITS.maxFiles) {
          throw new ImportLimitError("files");
        }
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        if (file.size > DIRECTORY_IMPORT_LIMITS.maxFileBytes) {
          throw new ImportLimitError("file-size");
        }
        totalBytes += file.size;
        if (totalBytes > DIRECTORY_IMPORT_LIMITS.maxTotalBytes) {
          throw new ImportLimitError("total-size");
        }
        results.push({ relativePath: nextPath, file });
        continue;
      }
      if ((handle as FileSystemDirectoryHandle).kind === "directory") {
        await walkDirectory(handle as FileSystemDirectoryHandle, nextPath, depth + 1);
      }
    }
  }
  await walkDirectory(root, "", 0);
  return results;
}

function normalizeEntryPath(value: string): string {
  return value.replace(/\\/g, "/");
}

async function importMarkdownFiles(
  markdownFiles: DirectoryFileEntry[],
  signal?: AbortSignal,
): Promise<Note[]> {
  const importedNotes: Note[] = [];
  for (const fileEntry of markdownFiles) {
    throwIfAborted(signal);
    const normalizedPath = normalizeEntryPath(fileEntry.relativePath);
    const text = await fileEntry.file.text();
    throwIfAborted(signal);
    const note = createNoteFromMarkdownPath(normalizedPath, text);
    importedNotes.push(note);
  }
  return importedNotes;
}

async function exportNotes(notes: Note[], dirHandle: FileSystemDirectoryHandle): Promise<void> {
  for (const note of notes) {
    await writeNoteFiles(note, dirHandle);
  }
}

async function writeNoteFiles(note: Note, dirHandle: FileSystemDirectoryHandle): Promise<void> {
  const relativePath = toMarkdownRelativePath(note.path);
  await writeTextFile(dirHandle, relativePath, note.body);
}

async function writeTextFile(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
  content: string,
): Promise<void> {
  const writable = await createWritableFile(rootHandle, relativePath);
  await writable.write(content);
  await writable.close();
}

async function createWritableFile(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<FileSystemWritableFileStream> {
  const normalized = normalizeEntryPath(relativePath);
  const segments = normalized.split("/").filter(Boolean);
  const fileName = segments.pop() ?? "note.md";
  let currentDir = rootHandle;
  for (const segment of segments) {
    currentDir = await currentDir.getDirectoryHandle(segment, { create: true });
  }
  const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
  return fileHandle.createWritable();
}

class ImportLimitError extends Error {
  constructor(readonly limit: "depth" | "files" | "file-size" | "total-size") {
    super(`Directory import ${limit} limit exceeded`);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Directory import was cancelled", "AbortError");
  }
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted || (error instanceof DOMException && error.name === "AbortError"));
}
