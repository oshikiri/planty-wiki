import { useEffect, useRef, useState, type Dispatch, type StateUpdater } from "preact/hooks";
import type { NoteService } from "../services/note-service";
import type { Note } from "../types/note";
import type { NoteChangeEvent } from "../types/sync";
import type { Route } from "../navigation/route";
import type { Router } from "../navigation/router";
import { deriveTitleFromPath } from "../domain/note";
import { resolveBundledDocBody } from "../defaults/initial-docs";

type SyncNoteUpdatesParams = {
  noteService: NoteService;
  router: Router;
  route: Route;
  currentNote: Note | null;
  hasPendingChanges: boolean;
  setCurrentNote: Dispatch<StateUpdater<Note | null>>;
  setDraftBody: Dispatch<StateUpdater<string>>;
  setRoute: Dispatch<StateUpdater<Route>>;
  incrementNoteRevision: () => void;
  incrementNoteListRevision: () => void;
  setStatusMessage: Dispatch<StateUpdater<string>>;
};

/**
 * Refreshes notes after synchronization without replacing unsaved editor contents.
 *
 * @param params App state and callbacks used to apply synchronized notes
 * @returns void
 */
export function useSyncNoteUpdates(params: SyncNoteUpdatesParams) {
  const { noteService, hasPendingChanges, route, incrementNoteListRevision } = params;
  const latest = useRef(params);
  latest.current = params;
  const pending = useRef<NoteChangeEvent | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(
    () =>
      noteService.subscribeToChanges(async (event) => {
        incrementNoteListRevision();
        if (event.type === "resolution") {
          pending.current = null;
          const selected = latest.current.route;
          if (selected.type !== "note" || selected.path !== event.previousPath) return;
          const target = event.path ?? event.previousPath;
          const note = await noteService.loadNote(target);
          if (latest.current.route.type === "note" && latest.current.route.path === selected.path) {
            applySyncedNote(latest.current, target, note);
          }
          return;
        }
        pending.current = event;
        setRevision((value) => value + 1);
      }),
    [noteService, incrementNoteListRevision],
  );
  useEffect(() => {
    const event = pending.current;
    if (!event || route.type !== "note" || hasPendingChanges) return;
    let cancelled = false;
    const target = route.path;
    void noteService
      .loadNote(target)
      .then((note) => {
        if (cancelled || latest.current.hasPendingChanges) return;
        if (pending.current === event) pending.current = null;
        applySyncedNote(latest.current, target, note);
      })
      .catch((error) => {
        console.error("Failed to refresh synchronized note", error);
        if (!cancelled) latest.current.setStatusMessage("Failed to refresh synchronized note");
      });
    return () => {
      cancelled = true;
    };
  }, [noteService, route, hasPendingChanges, revision]);
}

function applySyncedNote(params: SyncNoteUpdatesParams, path: string, note: Note | null) {
  const body = resolveBundledDocBody(path) ?? note?.body ?? "";
  const updated = note ? { ...note, body } : { path, title: deriveTitleFromPath(path), body };
  if (
    params.currentNote?.path === path &&
    params.currentNote.body === body &&
    params.currentNote.title === updated.title
  )
    return;
  if (params.route.type === "note" && params.route.path !== path) {
    const route: Route = { type: "note", path };
    params.router.navigate(route);
    params.setRoute(route);
  }
  params.setCurrentNote(updated);
  params.setDraftBody(body);
  params.incrementNoteRevision();
}
