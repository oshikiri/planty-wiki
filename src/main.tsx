import { render } from "preact";

import { App, StorageInitError } from "./app";
import { createOpfsNoteRepository } from "./infrastructure/storage-note-repository";
import { createNoteService } from "./services/note-service";
import { createQueryService } from "./services/query-service";
import { createHashRouter } from "./navigation/router";

const rootElement = document.getElementById("root");

if (rootElement) {
  try {
    const repository = createOpfsNoteRepository();
    const noteService = createNoteService(repository);
    const queryService = createQueryService();
    const router = createHashRouter();
    render(
      <App noteService={noteService} queryService={queryService} router={router} />,
      rootElement,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    render(<StorageInitError message={message} />, rootElement);
  }
}
