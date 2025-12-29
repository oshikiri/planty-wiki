import { $applyNodeReplacement, TextNode } from "lexical";
import type { EditorConfig, SerializedTextNode } from "lexical";

export type SerializedWikiLinkNode = SerializedTextNode & {
  type: "wikilink";
  version: 1;
};

export class WikiLinkNode extends TextNode {
  static readonly CLASS_NAME = "lexical-wikilink";

  static getType(): string {
    return "wikilink";
  }

  static clone(node: WikiLinkNode): WikiLinkNode {
    return new WikiLinkNode(node.__text, node.__key);
  }

  static importJSON(serializedNode: SerializedWikiLinkNode): WikiLinkNode {
    const node = $createWikiLinkNode(serializedNode.text);
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);
    return node;
  }

  exportJSON(): SerializedWikiLinkNode {
    return {
      ...super.exportJSON(),
      type: "wikilink",
      version: 1,
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.classList.add(WikiLinkNode.CLASS_NAME);
    return dom;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  isTextEntity(): true {
    return true;
  }
}

/**
 * Replaces the current text node with a WikiLinkNode so it can represent `[[Page]]` syntax.
 *
 * @param text Text assigned to the node
 * @returns The inserted WikiLinkNode
 */
export function $createWikiLinkNode(text: string): WikiLinkNode {
  return $applyNodeReplacement(new WikiLinkNode(text));
}
