import type { Dispatch, StateUpdater } from "preact/hooks";

import { normalizePath } from "../navigation";
import type { Route } from "../navigation/route";
import type { Router } from "../navigation/router";
import type { Note } from "../types/note";
import type { NoteService } from "../services/note-service";

type SelectOrCreateNoteParams = {
  path: string;
  defaultPage: string;
  deriveTitle: (path: string) => string;
  notes: Note[];
  sanitizeNoteForSave: (note: Note) => Note;
  setDraftBody: Dispatch<StateUpdater<string>>;
  setNotes: Dispatch<StateUpdater<Note[]>>;
  setRoute: Dispatch<StateUpdater<Route>>;
  setStatusMessage: Dispatch<StateUpdater<string>>;
  noteService: NoteService;
  router: Router;
};

/**
 * Normalizes the given path and performs selection or creation before routing to the note.
 *
 * @param params Dependencies required for the transition such as note lists and save functions
 * @returns Promise that resolves when the flow completes
 */
export async function selectOrCreateNote({
  path,
  defaultPage,
  deriveTitle,
  notes,
  sanitizeNoteForSave,
  setDraftBody,
  setNotes,
  setRoute,
  setStatusMessage,
  noteService,
  router,
}: SelectOrCreateNoteParams): Promise<void> {
  const normalized = path ? normalizePath(path) : defaultPage;
  const existingNote = notes.find((note) => note.path === normalized);
  let nextBody = existingNote?.body ?? "";
  if (!existingNote) {
    const title = deriveTitle(normalized);
    const newNote = sanitizeNoteForSave({ path: normalized, title, body: "" });
    setNotes((prev) => [...prev, newNote]);
    try {
      await noteService.saveNote(newNote);
    } catch (error) {
      console.error("Failed to create note via selectOrCreateNote", error);
      setStatusMessage("Failed to create note");
    }
    nextBody = newNote.body;
  }
  const nextRoute: Route = { type: "note", path: normalized };
  setRoute(nextRoute);
  setDraftBody(nextBody);
  router.navigate(nextRoute);
}
