import { normalizePath } from "../navigation";

export interface Note {
  path: string;
  title: string;
  body: string;
  updatedAt?: string;
}

export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
}

export type NoteInput = {
  path: string;
  title?: string | null;
  body?: string | null;
  updatedAt?: string | null;
};

/**
 * buildNoteはNoteInputを受け取り、パス正規化やタイトル補完を経て完全なNoteエンティティへ変換する。
 *
 * @param input 永続化前のNote入力
 * @param fallbackTitle Titleが空だった場合に使うフォールバック
 * @returns 正規化されたNote
 */
export function buildNote(input: NoteInput, fallbackTitle = "untitled"): Note {
  const normalizedPath = normalizePath(input.path);
  const trimmedTitle = input.title?.trim() ?? "";
  const title = trimmedTitle || deriveTitleFromPath(normalizedPath, fallbackTitle);
  const body = typeof input.body === "string" ? input.body : "";
  const updatedAt = input.updatedAt?.trim();
  if (updatedAt) {
    return { path: normalizedPath, title, body, updatedAt };
  }
  return { path: normalizedPath, title, body };
}

/**
 * deriveTitleFromPathはノートパスの末尾セグメントからタイトル文字列を導出し、空ならフォールバックを返す。
 *
 * @param path ノートのパス
 * @param fallback パスが空だった場合に使うタイトル
 * @returns パス末尾のセグメントまたはフォールバック
 */
export function deriveTitleFromPath(path: string, fallback = "untitled"): string {
  const segments = path.split("/").filter(Boolean);
  return segments.slice(-1)[0] ?? fallback;
}
