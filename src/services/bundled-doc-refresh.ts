import { loadBundledDocs } from "../defaults/initial-docs";
import type { NoteRepository } from "../domain/note-repository";

/** Shares startup refreshes and retries after a failed transaction. */
export function createBundledDocRefresh(repository: NoteRepository, onRefreshed: () => void) {
  let pending: Promise<void> | null = null;
  return () => {
    pending ??= loadBundledDocs()
      .then((docs) => repository.refreshBundledDocs(docs))
      .then(onRefreshed)
      .catch((error) => {
        pending = null;
        throw error;
      });
    return pending;
  };
}
