import { afterEach, expect, it, vi } from "vitest";
import { importMarkdownFromDirectory } from "./file-bridge";
import type { NoteRepository } from "../domain/note-repository";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("does not replace stored notes when cancelled during the last file read", async () => {
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

it("does not start saving after cancellation during directory enumeration", async () => {
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
