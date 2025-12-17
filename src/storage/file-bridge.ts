import { normalizePath } from "../navigation";
import type { Note, NoteStorage } from "./index";

type DirectoryFileEntry = {
  relativePath: string;
  file: File;
};

/**
 * ユーザー指定ディレクトリからMarkdownと同ディレクトリの画像を読み込み、ノートストレージへ一括反映する。
 *
 * @param storage 永続化に利用するNoteStorage実装
 * @param applyImportedNotes ストレージの最新状態をUIへ反映するコールバック
 * @param setStatusMessage 進捗やエラーをユーザーへ伝えるステータス更新関数
 * @returns インポート完了を待機するPromise
 */
export async function importMarkdownFromDirectory(
  storage: NoteStorage,
  applyImportedNotes: (notes: Note[]) => void,
  setStatusMessage: (message: string) => void,
): Promise<void> {
  const anyWindow = window as typeof window & { showDirectoryPicker?: () => Promise<unknown> };
  if (typeof anyWindow.showDirectoryPicker !== "function") {
    setStatusMessage("This browser does not support directory access");
    setTimeout(() => setStatusMessage(""), 2000);
    return;
  }
  try {
    const dirHandle =
      (await anyWindow.showDirectoryPicker()) as unknown as FileSystemDirectoryHandle;
    const entries = await collectDirectoryEntries(dirHandle);
    const markdownFiles = entries.filter((entry) =>
      entry.relativePath.toLowerCase().endsWith(".md"),
    );
    if (!markdownFiles.length) {
      setStatusMessage("No Markdown files found in the selected folder");
      setTimeout(() => setStatusMessage(""), 2000);
      return;
    }
    const importedNotes = await importMarkdownFilesWithProgress({
      markdownFiles,
      setStatusMessage,
    });
    await storage.importNotes(importedNotes);
    const updated = await storage.loadNotes();
    applyImportedNotes(updated);
    setStatusMessage(`Imported ${importedNotes.length} notes from folder`);
    setTimeout(() => setStatusMessage(""), 2000);
  } catch (error) {
    console.error("Failed to import Markdown notes", error);
    setStatusMessage("Failed to import Markdown notes");
    setTimeout(() => setStatusMessage(""), 2000);
  }
}

/**
 * 指定ノート一覧をユーザーが選んだディレクトリへMarkdownと添付ファイルとして書き出す。
 *
 * @param notes エクスポート対象ノートの配列
 * @param setStatusMessage 進捗やエラーを表すメッセージ更新関数
 * @returns エクスポート完了を待機するPromise
 */
export async function exportNotesToDirectory(
  notes: Note[],
  setStatusMessage: (message: string) => void,
): Promise<void> {
  if (!notes.length) {
    setStatusMessage("No notes to export");
    setTimeout(() => setStatusMessage(""), 2000);
    return;
  }
  const anyWindow = window as typeof window & { showDirectoryPicker?: () => Promise<unknown> };
  if (typeof anyWindow.showDirectoryPicker !== "function") {
    setStatusMessage("This browser does not support directory access");
    setTimeout(() => setStatusMessage(""), 2000);
    return;
  }
  try {
    const dirHandle =
      (await anyWindow.showDirectoryPicker()) as unknown as FileSystemDirectoryHandle;
    await exportNotes(notes, dirHandle);
    setStatusMessage(`Exported ${notes.length} notes to folder`);
    setTimeout(() => setStatusMessage(""), 2000);
  } catch (error) {
    console.error("Failed to export Markdown notes", error);
    setStatusMessage("Failed to export Markdown notes");
    setTimeout(() => setStatusMessage(""), 2000);
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
  // ページタイトルは常にファイル名由来に統一し、本文内の見出しには依存しない
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

type ImportLoopParams = {
  markdownFiles: DirectoryFileEntry[];
  setStatusMessage: (message: string) => void;
};

async function importMarkdownFilesWithProgress({
  markdownFiles,
  setStatusMessage,
}: ImportLoopParams): Promise<Note[]> {
  const importedNotes: Note[] = [];
  const totalNotes = markdownFiles.length;
  for (let index = 0; index < totalNotes; index++) {
    const fileEntry = markdownFiles[index];
    const progressPercent = Math.round(((index + 1) / totalNotes) * 100);
    setStatusMessage(`Importing notes (${index + 1}/${totalNotes}, ${progressPercent}%)`);
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
