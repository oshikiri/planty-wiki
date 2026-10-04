// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createNoteService, type NoteService } from "./note-service";
import type { Note } from "../types/note";
import type { NoteRepository } from "../domain/note-repository";
import { DEFAULT_README_MARKDOWN } from "../defaults/initial-docs";

describe("NoteService", () => {
  describe("#loadNoteSummaries", () => {
    it("loads summaries after the initial sync completes", async () => {
      const repository = createInMemoryRepository([]);
      repository.syncPendingChanges = async () => {
        await repository.save({
          path: "/pages/remote",
          title: "Remote",
          body: "Remote body",
          updatedAt: "2024-01-02T00:00:00.000Z",
        });
        return { status: "synced", syncedChanges: 0, receivedChanges: 1 };
      };
      const service = createNoteService(repository);

      await expect(service.loadNoteSummaries()).resolves.toEqual([
        {
          path: "/pages/remote",
          title: "Remote",
          updatedAt: "2024-01-02T00:00:00.000Z",
        },
      ]);
    });
  });

  describe("#saveNote", () => {
    it("persists the note so other accessors can read it", async () => {
      const service = createInMemoryNoteService();
      const note: Note = {
        path: "/pages/test",
        title: "Test",
        body: "Example",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      await service.saveNote(note);
      expect(await service.loadNote(note.path)).toEqual(note);
      expect(await service.loadNoteSummaries()).toEqual([
        { path: note.path, title: note.title, updatedAt: note.updatedAt },
      ]);
    });
  });

  describe("#listBacklinks", () => {
    it("returns notes whose bodies reference the target", async () => {
      const targetPath = "/pages/target";
      const source: Note = {
        path: "/pages/source",
        title: "Source",
        body: `Contains ${targetPath}`,
        updatedAt: "2024-01-02T00:00:00.000Z",
      };
      const service = createInMemoryNoteService([
        {
          path: targetPath,
          title: "Target",
          body: "Target body",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
        source,
      ]);

      const backlinks = await service.listBacklinks(targetPath);
      expect(backlinks).toEqual([source]);
      await service.deleteNote(targetPath);
      expect(await service.loadNote(targetPath)).toBeNull();
    });
  });
});

function createInMemoryNoteService(initialNotes: Note[] = []): NoteService {
  const repository: NoteRepository = createInMemoryRepository(initialNotes);
  return createNoteService(repository);
}

function createInMemoryRepository(initialNotes: Note[]): NoteRepository {
  let notes = [...initialNotes];
  return {
    async refreshBundledDocs() {},
    async loadSummaries() {
      return notes.map((note) => ({
        path: note.path,
        title: note.title,
        updatedAt: note.updatedAt,
      }));
    },
    async loadByPath(path: Note["path"]) {
      return notes.find((note) => note.path === path) ?? null;
    },
    async loadAll() {
      return [...notes];
    },
    async save(note: Note) {
      const index = notes.findIndex((entry) => entry.path === note.path);
      if (index === -1) {
        notes = [...notes, note];
        return;
      }
      const copy = [...notes];
      copy[index] = note;
      notes = copy;
    },
    async delete(path: Note["path"]) {
      notes = notes.filter((note) => note.path !== path);
    },
    async loadPendingSyncChanges() {
      return [];
    },
    async loadSyncConflicts() {
      return [];
    },
    async resolveSyncConflict() {
      return { previousPath: "/pages/test", path: "/pages/test" };
    },
    async syncPendingChanges() {
      return { status: "idle", syncedChanges: 0, receivedChanges: 0 };
    },
    async importBatch(imported: Note[]) {
      notes = [...imported];
    },
    async listBacklinks(targetPath: Note["path"]) {
      return notes.filter((note) => note.body.includes(targetPath));
    },
  };
}

it("waits for the resolved version to reach the UI before completing resolution", async () => {
  const repository = createInMemoryRepository([]);
  const service = createNoteService(repository);
  const events: string[] = [];
  let complete!: () => void;
  service.subscribeToChanges(async (event) => {
    events.push(event.type);
    await new Promise<void>((resolve) => {
      complete = resolve;
    });
  });
  const resolution = service
    .resolveSyncConflict("note-id", "server")
    .then(() => events.push("complete"));
  await vi.waitFor(() => expect(events).toEqual(["resolution"]));
  complete();
  await resolution;
  expect(events).toEqual(["resolution", "complete"]);
});

it("refreshes bundled pages once before concurrent reads and sync", async () => {
  const repository = createInMemoryRepository([]);
  const events: string[] = [];
  const refresh = vi.spyOn(repository, "refreshBundledDocs").mockImplementation(async () => {
    await Promise.resolve();
    events.push("refresh");
  });
  repository.loadByPath = async () => {
    expect(events).toContain("refresh");
    return null;
  };
  repository.loadPendingSyncChanges = async () => {
    expect(events).toContain("refresh");
    return [];
  };
  repository.loadSyncConflicts = async () => {
    expect(events).toContain("refresh");
    return [];
  };
  repository.syncPendingChanges = async () => {
    expect(events).toContain("refresh");
    return { status: "idle", syncedChanges: 0, receivedChanges: 0 };
  };
  const service = createNoteService(repository);
  await Promise.all([
    service.loadNote("/pages/README"),
    service.loadNoteSummaries(),
    service.syncPendingChanges(),
    service.loadPendingSyncChanges(),
    service.loadSyncConflicts(),
  ]);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(refresh.mock.calls[0][0]).toContainEqual({
    path: "/pages/README",
    body: DEFAULT_README_MARKDOWN,
    hash: createHash("sha256").update(DEFAULT_README_MARKDOWN).digest("hex"),
  });
});

it("retries a failed bundled refresh before allowing a read", async () => {
  const repository = createInMemoryRepository([]);
  const refresh = vi
    .spyOn(repository, "refreshBundledDocs")
    .mockRejectedValueOnce(new Error("Storage failure"));
  const load = vi.spyOn(repository, "loadByPath");
  const service = createNoteService(repository);
  await expect(service.loadNote("/pages/README")).rejects.toThrow("Storage failure");
  expect(load).not.toHaveBeenCalled();
  await expect(service.loadNote("/pages/README")).resolves.toBeNull();
  expect(refresh).toHaveBeenCalledTimes(2);
});
