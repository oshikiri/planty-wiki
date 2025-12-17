import { useEffect } from "preact/hooks";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LinkNode } from "@lexical/link";

const REQUIRED_REL_VALUES = ["noopener", "noreferrer"] as const;

/**
 * 全てのリンクに対して `target="_blank"` を既定値とし、`rel` に `noopener noreferrer` を追加することで
 * リンククリック時のリファラ漏洩や opener 経由のリスクを低減する Lexical プラグイン。
 *
 * @returns LinkNode に対するセキュリティ設定を行う Lexical プラグイン
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
