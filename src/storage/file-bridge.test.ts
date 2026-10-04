import { afterEach, expect, it, vi } from "vitest";
import { importMarkdownFromDirectory } from "./file-bridge";
import type { NoteRepository } from "../domain/note-repository";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("最後のファイルの読み込み中にキャンセルされた場合は保存済みノートを置き換えない", async () => {
  const controller = new AbortController();
  const text = vi.fn(async () => {
    controller.abort();
    return "# Imported";
  });
  const file = { size: 10, text };
  const root = {
    async *entries() {
      yield ["test.md", { kind: "file", getFile: async () => file }];
    },
  };
  vi.stubGlobal("window", { showDirectoryPicker: async () => root });
  const importBatch = vi.fn();
  const repository = { importBatch, loadAll: vi.fn() } as unknown as NoteRepository;
  await expect(importMarkdownFromDirectory(repository, controller.signal)).resolves.toEqual({
    status: "cancelled",
  });
  expect(text).toHaveBeenCalledOnce();
  expect(importBatch).not.toHaveBeenCalled();
});

it("ディレクトリ内の項目の列挙中にキャンセルされた場合は保存を開始しない", async () => {
  const controller = new AbortController();
  const root = {
    async *entries() {
      controller.abort();
      yield ["test.md", { kind: "file" }];
    },
  };
  vi.stubGlobal("window", { showDirectoryPicker: async () => root });
  const importBatch = vi.fn();
  const repository = { importBatch } as unknown as NoteRepository;
  await expect(importMarkdownFromDirectory(repository, controller.signal)).resolves.toEqual({
    status: "cancelled",
  });
  expect(importBatch).not.toHaveBeenCalled();
});
