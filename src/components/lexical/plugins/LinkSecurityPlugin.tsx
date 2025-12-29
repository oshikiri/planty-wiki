import { useEffect } from "preact/hooks";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LinkNode } from "@lexical/link";

const REQUIRED_REL_VALUES = ["noopener", "noreferrer"] as const;

/**
 * Lexical plugin that sets `target="_blank"` and adds `rel="noopener noreferrer"` to every link to mitigate referrer leaks and opener risks.
 *
 * @returns Plugin that applies security defaults to LinkNode
 */
export function LinkSecurityPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(LinkNode, (node) => {
      if (!node.getTarget()) {
        node.setTarget("_blank");
      }
      const currentRel = node.getRel();
      const tokens = currentRel
        ? currentRel.split(/\s+/).filter((value) => value.trim().length > 0)
        : [];
      const normalized = new Set(tokens);
      let added = false;
      for (const required of REQUIRED_REL_VALUES) {
        if (!normalized.has(required)) {
          normalized.add(required);
          added = true;
        }
      }
      if (added && normalized.size > 0) {
        node.setRel(Array.from(normalized).join(" "));
      }
    });
  }, [editor]);

  return null;
}
