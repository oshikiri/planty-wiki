import { normalizePath } from "../navigation";
import type { Note } from "../types/note";
import type { NoteRepository } from "../domain/note-repository";

type DirectoryFileEntry = {
  relativePath: string;
  file: File;
};

export type ImportMarkdownResult =
  | { status: "unsupported" }
  | { status: "no-markdown" }
  | { status: "success"; importedCount: number; notes: Note[] }
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
 * @returns Result of the import operation
 */
export async function importMarkdownFromDirectory(
  repository: NoteRepository,
): Promise<ImportMarkdownResult> {
  const anyWindow = window as typeof window & { showDirectoryPicker?: () => Promise<unknown> };
  if (typeof anyWindow.showDirectoryPicker !== "function") {
    return { status: "unsupported" };
  }
  try {
    const dirHandle =
      (await anyWindow.showDirectoryPicker()) as unknown as FileSystemDirectoryHandle;
    const entries = await collectDirectoryEntries(dirHandle);
    const markdownFiles = entries.filter((entry) =>
      entry.relativePath.toLowerCase().endsWith(".md"),
    );
    if (!markdownFiles.length) {
      return { status: "no-markdown" };
    }
    const importedNotes = await importMarkdownFiles(markdownFiles);
    await repository.importBatch(importedNotes);
    const updated = await repository.loadAll();
    return {
      status: "success",
      importedCount: importedNotes.length,
      notes: updated,
    };
  } catch (error) {
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
  const baseName = normalizedPath.split("/").filter(Boolean).slice(-1)[0] ?? "untitled";
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
): Promise<DirectoryFileEntry[]> {
  const results: DirectoryFileEntry[] = [];
  async function walkDirectory(dir: FileSystemDirectoryHandle, prefix: string) {
    for await (const [name, handle] of dir.entries()) {
      const nextPath = prefix ? `${prefix}/${name}` : name;
      if ((handle as FileSystemFileHandle).kind === "file") {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        results.push({ relativePath: nextPath, file });
        continue;
      }
      if ((handle as FileSystemDirectoryHandle).kind === "directory") {
        await walkDirectory(handle as FileSystemDirectoryHandle, nextPath);
      }
    }
  }
  await walkDirectory(root, "");
  return results;
}

function normalizeEntryPath(value: string): string {
  return value.replace(/\\/g, "/");
}

async function importMarkdownFiles(markdownFiles: DirectoryFileEntry[]): Promise<Note[]> {
  const importedNotes: Note[] = [];
  for (const fileEntry of markdownFiles) {
    const normalizedPath = normalizeEntryPath(fileEntry.relativePath);
    const text = await fileEntry.file.text();
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
