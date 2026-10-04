import { expect, it, vi } from "vitest";
import { bootstrapNotes } from "./bootstrapNotes";
import { selectOrCreateNote } from "./selectOrCreateNote";
import type { NoteStoragePort } from "./ports";
import { buildNote, deriveTitleFromPath } from "../domain/note";

const savedNote = { path: "/pages/README", title: "README", body: "My saved edits" };

function createDependencies() {
  const storage: NoteStoragePort = {
    loadNoteSummaries: vi.fn().mockResolvedValue([savedNote]),
    loadNote: vi.fn().mockResolvedValue(savedNote),
    saveNote: vi.fn(),
    deleteNote: vi.fn(),
  };
  return {
    defaultPage: savedNote.path,
    deriveTitle: deriveTitleFromPath,
    sanitizeNoteForSave: buildNote,
    resolveBundledDocBody: () => "Bundled body",
    noteStorage: storage,
  };
}

it("preserves saved documentation edits during boot with and without a note route", async () => {
  const dependencies = createDependencies();
  for (const route of [null, { kind: "note" as const, path: savedNote.path }]) {
    const result = await bootstrapNotes({
      ...dependencies,
      defaultNoteBody: "Bundled body",
      getCurrentRoute: () => route,
    });
    expect(result.initialNote).toEqual(savedNote);
  }
  expect(dependencies.noteStorage.saveNote).not.toHaveBeenCalled();
});

it("preserves saved documentation edits when selecting an existing page", async () => {
  const dependencies = createDependencies();
  const result = await selectOrCreateNote({ ...dependencies, path: savedNote.path });
  expect(result.note).toEqual(savedNote);
  expect(dependencies.noteStorage.saveNote).not.toHaveBeenCalled();
});

it("creates a missing documentation page from its bundled body when explicitly opened", async () => {
  const dependencies = createDependencies();
  vi.mocked(dependencies.noteStorage.loadNote).mockResolvedValue(null);
  const result = await selectOrCreateNote({ ...dependencies, path: savedNote.path });
  expect(result.created).toBe(true);
  expect(result.note).toMatchObject({
    path: savedNote.path,
    title: "README",
    body: "Bundled body",
  });
  expect(dependencies.noteStorage.saveNote).toHaveBeenCalledWith(result.note);
});
