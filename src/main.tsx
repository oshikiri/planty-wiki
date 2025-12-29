import { render } from "preact";

import { App, StorageInitError } from "./app";
import { createOpfsNoteRepository } from "./infrastructure/opfs-note-repository";
import { createNoteService } from "./services/note-service";

const rootElement = document.getElementById("root");

if (rootElement) {
  try {
    const repository = createOpfsNoteRepository();
    const noteService = createNoteService(repository);
    render(<App noteService={noteService} />, rootElement);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    render(<StorageInitError message={message} />, rootElement);
  }
}
