import { useEffect } from "preact/hooks";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  type RangeSelection,
} from "lexical";

/**
 * Adds Emacs-style Ctrl+A/E shortcuts to the Lexical editor.
 *
 * @returns null because it only registers Lexical commands
 */
export function CtrlKeyBindingsPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        if (!event.ctrlKey || event.metaKey || event.altKey) {
          return false;
        }
        const handler = ctrlKeyBindings[event.key.toLowerCase()];
        if (!handler) {
          return false;
        }
        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return;
          }
          handler(selection, event);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}

type CtrlKeyHandler = (selection: RangeSelection, event: KeyboardEvent) => void;

// Add additional Ctrl-based shortcuts here to keep them centralized.
const ctrlKeyBindings: Record<string, CtrlKeyHandler> = {
  a: (selection, event) => moveSelectionAlongLineBoundary(selection, event, true),
  e: (selection, event) => moveSelectionAlongLineBoundary(selection, event, false),
};

function moveSelectionAlongLineBoundary(
  selection: RangeSelection,
  event: KeyboardEvent,
  isBackward: boolean,
) {
  const alter = event.shiftKey ? "extend" : "move";
  selection.modify(alter, isBackward, "lineboundary");
}
