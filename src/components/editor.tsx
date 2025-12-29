import type { Backlink } from "../hooks/useBacklinks";
import type { Note } from "../types/note";
import { PlantyEditor } from "./lexical/PlantyEditor";
import styles from "./editor.module.css";

type EditorProps = {
  note: Note;
  noteRevision: number;
  onChangeDraft: (value: string) => void;
  statusMessage: string;
  isDirty: boolean;
  backlinks: Backlink[];
  onSelectPath: (path: string) => void;
};

/**
 * Renders the editing UI for a single note together with backlinks.
 *
 * @param props.note The note being displayed and edited
 * @param props.noteRevision Revision counter propagated to Lexical on note replacement
 * @param props.onChangeDraft Handler fired when the editor content changes
 * @param props.statusMessage Latest status message shown below the editor
 * @param props.isDirty Whether the local draft has unsaved changes
 * @param props.backlinks List of pages that reference the current note
 * @param props.onSelectPath Navigation handler invoked from backlinks
 * @returns JSX containing the editor and related elements
 */
export function Editor(props: EditorProps) {
  return (
    <section class={styles.editor}>
      <EditorHeader
        title={props.note.title || props.note.path}
        isDirty={props.isDirty}
        statusMessage={props.statusMessage}
      />
      <article class={styles.editorBody}>
        <PlantyEditor
          // Keep the key stable during autosave to avoid resetting the caret position.
          noteKey={`${props.note.path}:${props.noteRevision}`}
          initialMarkdown={props.note.body}
          onMarkdownChange={props.onChangeDraft}
          onWikiLinkClick={props.onSelectPath}
        />
        <BacklinksSection backlinks={props.backlinks} onSelectPath={props.onSelectPath} />
      </article>
    </section>
  );
}

function EditorHeader({
  title,
  isDirty,
  statusMessage,
}: {
  title: string;
  isDirty: boolean;
  statusMessage: string;
}) {
  return (
    <header class={styles.editorHeader}>
      <h1 class={styles.editorTitle}>{title}</h1>
      <div class={styles.editorControls}>
        <div class={styles.editorStatusBar}>
          <span
            class={`${styles.editorStatusIcon} ${isDirty ? styles.editorStatusIconDirty : styles.editorStatusIconClean}`}
            aria-hidden="true"
          />
        </div>
        {statusMessage ? (
          <output class={styles.editorStatus} aria-live="polite" aria-atomic="true">
            {statusMessage}
          </output>
        ) : null}
      </div>
    </header>
  );
}

function BacklinksSection({
  backlinks,
  onSelectPath,
}: {
  backlinks: Backlink[];
  onSelectPath: (path: string) => void;
}) {
  if (!backlinks.length) {
    return null;
  }
  return (
    <section class={styles.backlinksSection} aria-label="Backlinks">
      <h2 class={styles.backlinksTitle}>Backlinks</h2>
      <div class={styles.backlinksList}>
        {backlinks.map((backlink) => (
          <button
            key={backlink.path}
            type="button"
            class={styles.backlinksItem}
            onClick={() => onSelectPath(backlink.path)}
          >
            <span class={styles.backlinksItemTitle}>{backlink.title}</span>
            <span class={styles.backlinksItemSnippet}>{backlink.snippet}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
