import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeNode } from "@lexical/code";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import { WikiLinkNode } from "./WikiLinkNode";

export const lexicalConfig: InitialConfigType = {
  namespace: "planty-notes",
  theme: {},
  nodes: [
    HeadingNode,
    ListNode,
    ListItemNode,
    QuoteNode,
    CodeNode,
    LinkNode,
    AutoLinkNode,
    WikiLinkNode,
  ],
  onError(error, editor) {
    console.error("Lexical editor error", error, editor);
  },
};
