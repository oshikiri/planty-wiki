import { QueryPage } from "./components/query-page";
import { Sidebar } from "./components/sidebar";
import { SearchSidebar } from "./components/search-sidebar";
import { Editor } from "./components/editor";
import type { NoteService } from "./services/note-service";
import type { QueryService } from "./services/query-service";
import type { Router } from "./navigation/router";

import { useAppController } from "./hooks/useAppController";

import styles from "./app.module.css";

type AppProps = {
  noteService: NoteService;
  queryService: QueryService;
  router: Router;
};

/**
 * Renders the root component that orchestrates the entire Planty Wiki application.
 *
 * @param props Injected NoteService, QueryService, and Router dependencies
 * @returns Root application JSX
 */
export function App({ noteService, queryService, router }: AppProps) {
  const {
    noteRevision,
    noteListRevision,
    route,
    selectedNotePath,
    pendingDeletionPath,
    statusMessage,
    searchQuery,
    searchResults,
    editorNote,
    isDirty,
    backlinks,
    handleSearch,
    handleSelectPath,
    handleOpenQuery,
    handleImportMarkdown,
    handleExportMarkdown,
    handleChangeDraft,
    handleRequestDelete,
    handleCancelDelete,
    handleDeleteNote,
  } = useAppController({ noteService, router });

  return (
    <div class={styles.app}>
      <main class={styles.appMain}>
        <Sidebar
          noteService={noteService}
          noteListRevision={noteListRevision}
          selectedPath={selectedNotePath}
          onSelectPath={handleSelectPath}
          onOpenQuery={handleOpenQuery}
          onImportMarkdown={handleImportMarkdown}
          onExportMarkdown={handleExportMarkdown}
          onDeleteNote={handleRequestDelete}
          pendingDeletePath={pendingDeletionPath}
          onCancelDelete={handleCancelDelete}
          onConfirmDelete={handleDeleteNote}
        />
        {route.type === "query" ? (
          <QueryPage runQuery={queryService.runQuery} />
        ) : (
          <Editor
            note={editorNote}
            noteRevision={noteRevision}
            onChangeDraft={handleChangeDraft}
            statusMessage={statusMessage}
            isDirty={isDirty}
            backlinks={backlinks}
            onSelectPath={handleSelectPath}
          />
        )}
        <SearchSidebar
          searchQuery={searchQuery}
          onChangeSearchQuery={handleSearch}
          searchResults={searchResults}
          onSelectPath={handleSelectPath}
        />
      </main>
    </div>
  );
}

/**
 * Renders an error message when persistent storage initialization fails.
 *
 * @param props Error message received from the browser environment
 * @returns UI that displays the initialization error
 */
export function StorageInitError({ message }: { message?: string | null }) {
  return (
    <div class={styles.app}>
      <output class={styles.storageWarning} aria-live="polite">
        Persistent storage initialization failed. Please reload with OPFS support enabled.
        {message ? ` (${message})` : ""}
      </output>
    </div>
  );
}
