import { useEffect, useRef } from "preact/hooks";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $convertFromMarkdownString, $convertToMarkdownString } from "@lexical/markdown";
import { CLEAR_HISTORY_COMMAND, type EditorState } from "lexical";

import { BASIC_TRANSFORMERS } from "../markdownTransformers";

type EditorPersistencePluginProps = {
  noteKey: string;
  initialMarkdown: string;
  onMarkdownChange: (markdown: string) => void;
};

/**
 * Handles Markdown import/export and history clearing when notes switch while keeping the caret stable during autosave renders.
 *
 * @param props.noteKey Note identifier passed to Lexical
 * @param props.initialMarkdown Markdown to load initially
 * @param props.onMarkdownChange Callback that notifies the parent about content changes
 * @returns null because the plugin only performs side effects
 */
export function EditorPersistencePlugin({
  noteKey,
  initialMarkdown,
  onMarkdownChange,
}: EditorPersistencePluginProps) {
  const [editor] = useLexicalComposerContext();
  const previousNoteKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const previousKey = previousNoteKeyRef.current;
    if (previousKey === noteKey) {
      // Skip re-import during autosave for the same note to keep the caret position intact.
      return;
    }
    previousNoteKeyRef.current = noteKey;
    editor.update(() => {
      $convertFromMarkdownString(initialMarkdown ?? "", BASIC_TRANSFORMERS);
    });
    // Clear the history stack only when the note changes so undo/redo does not leak across notes.
    if (previousKey !== null) {
      editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    }
  }, [editor, noteKey, initialMarkdown]);

  return (
    <OnChangePlugin
      onChange={(editorState: EditorState) => {
        editorState.read(() => {
          const markdown = $convertToMarkdownString(BASIC_TRANSFORMERS);
          onMarkdownChange(markdown);
        });
      }}
    />
  );
}
