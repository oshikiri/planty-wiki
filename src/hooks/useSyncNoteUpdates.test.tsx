import { render } from "preact";
import { useCallback, useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { useSyncNoteUpdates } from "./useSyncNoteUpdates";
import type { NoteService } from "../services/note-service";
import type { NoteChangeEvent } from "../types/sync";
import type { Note } from "../types/note";
import type { Route } from "../navigation/route";
import type { Router } from "../navigation/router";

const containers: HTMLElement[] = [];
afterEach(() => {
  for (const container of containers.splice(0)) render(null, container);
});

async function mountUpdates(path = "/pages/test") {
  const container = document.createElement("div");
  containers.push(container);
  const original: Note = { path, title: "Test", body: "Local" };
  let listener!: (event: NoteChangeEvent) => void | Promise<void>;
  let setPending!: (value: boolean) => void;
  const loadNote = vi.fn().mockResolvedValue({ ...original, body: "Server" });
  const navigate = vi.fn();
  const service = {
    loadNote,
    subscribeToChanges(next: typeof listener) {
      listener = next;
      return () => {};
    },
  } as unknown as NoteService;
  const router = { navigate } as unknown as Router;
  function Harness() {
    const [note, setNote] = useState<Note | null>(original);
    const [draft, setDraft] = useState(original.body);
    const [route, setRoute] = useState<Route>({ type: "note", path: original.path });
    const [pending, updatePending] = useState(false);
    const [revision, setRevision] = useState(0);
    const [, setListRevision] = useState(0);
    const [, setStatus] = useState("");
    const incrementNoteRevision = useCallback(() => setRevision((value) => value + 1), []);
    const incrementNoteListRevision = useCallback(() => setListRevision((value) => value + 1), []);
    setPending = updatePending;
    useSyncNoteUpdates({
      noteService: service,
      router,
      route,
      currentNote: note,
      hasPendingChanges: pending,
      setCurrentNote: setNote,
      setDraftBody: setDraft,
      setRoute,
      incrementNoteRevision,
      incrementNoteListRevision,
      setStatusMessage: setStatus,
    });
    return (
      <output>
        {note?.path}|{note?.body}|{draft}|{revision}
      </output>
    );
  }
  await act(() => render(<Harness />, container));
  return {
    container,
    loadNote,
    navigate,
    emit: (event: NoteChangeEvent) => listener(event),
    setPending: (value: boolean) => setPending(value),
  };
}

it("replaces the current draft and editor revision after adopting the server version", async () => {
  const f = await mountUpdates();
  await act(async () => {
    await f.emit({ type: "resolution", previousPath: "/pages/test", path: "/pages/test" });
  });
  expect(f.container.textContent).toBe("/pages/test|Server|Server|1");
});

it("navigates to the path chosen when resolving a conflicting local note", async () => {
  const f = await mountUpdates();
  f.loadNote.mockResolvedValue({ path: "/pages/renamed", title: "Test", body: "Renamed" });
  await act(async () => {
    await f.emit({ type: "resolution", previousPath: "/pages/test", path: "/pages/renamed" });
  });
  expect(f.navigate).toHaveBeenCalledWith({ type: "note", path: "/pages/renamed" });
  expect(f.container.textContent).toBe("/pages/renamed|Renamed|Renamed|1");
});

it("defers received updates while unsaved editor changes are present", async () => {
  const f = await mountUpdates();
  await act(() => f.setPending(true));
  await act(async () => {
    await f.emit({ type: "sync" });
  });
  expect(f.loadNote).not.toHaveBeenCalled();
  expect(f.container.textContent).toBe("/pages/test|Local|Local|0");
  await act(async () => {
    f.setPending(false);
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(f.container.textContent).toBe("/pages/test|Server|Server|1");
});

it("shows synchronized edits to a bundled page instead of its bundled body", async () => {
  const f = await mountUpdates("/pages/README");
  await act(async () => {
    await f.emit({ type: "resolution", previousPath: "/pages/README", path: "/pages/README" });
  });
  expect(f.container.textContent).toBe("/pages/README|Server|Server|1");
});
