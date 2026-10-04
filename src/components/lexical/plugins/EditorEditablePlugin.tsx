import { useEffect } from "preact/hooks";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

/**
 * Locks editor input while a conflict resolution replaces the current note.
 *
 * @param props Read-only state supplied by the app
 * @returns null because editing mode is updated through an effect
 */
export function EditorEditablePlugin({ isReadOnly }: { isReadOnly: boolean }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(!isReadOnly);
  }, [editor, isReadOnly]);
  return null;
}
