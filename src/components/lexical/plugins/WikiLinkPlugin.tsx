import { useEffect } from "preact/hooks";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { registerLexicalTextEntity } from "@lexical/text";
import { mergeRegister } from "@lexical/utils";
import type { LexicalEditor, TextNode } from "lexical";
import type { EntityMatch } from "@lexical/text";

import { normalizePath } from "../../../navigation";
import { $createWikiLinkNode, WikiLinkNode } from "../WikiLinkNode";

type WikiLinkPluginProps = {
  onWikiLinkClick: (path: string) => void;
};

const WIKI_LINK_PATTERN = /\[\[([^[\]]+)\]\]/;

function getWikiLinkMatch(text: string): EntityMatch | null {
  const match = WIKI_LINK_PATTERN.exec(text);
  if (!match) return null;
  const start = match.index;
  const end = start + match[0].length;
  return { start, end };
}

function registerWikiLinkEntity(editor: LexicalEditor): () => void {
  return mergeRegister(
    ...registerLexicalTextEntity(editor, getWikiLinkMatch, WikiLinkNode, (textNode: TextNode) =>
      $createWikiLinkNode(textNode.getTextContent()),
    ),
  );
}

/**
 * `[[Page]]`表記をWikiLinkノードへ差し替え、クリック時にノート遷移する挙動を追加するLexicalプラグイン。
 *
 * @param props.onWikiLinkClick Wikiリンクが押された際に呼び出される遷移ハンドラ
 * @returns null（Lexicalのプラグインとして副作用のみ行う）
 */
export function WikiLinkPlugin({ onWikiLinkClick }: WikiLinkPluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregisterEntity = registerWikiLinkEntity(editor);

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const linkElement = target.closest(".planty-wikilink");
      if (!(linkElement instanceof HTMLElement)) return;
      event.preventDefault();
      const text = linkElement.textContent ?? "";
      const match = text.match(/^\[\[([^[\]]+)\]\]$/);
      const label = match?.[1]?.trim();
      if (!label) return;
      const candidate = `/pages/${label}`;
      const normalized = normalizePath(candidate);
      onWikiLinkClick(normalized);
    }

    const unregisterRoot = editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement) {
        prevRootElement.removeEventListener("click", handleClick);
      }
      if (rootElement) {
        rootElement.addEventListener("click", handleClick);
      }
    });

    return () => {
      unregisterEntity();
      unregisterRoot();
    };
  }, [editor, onWikiLinkClick]);

  return null;
}
