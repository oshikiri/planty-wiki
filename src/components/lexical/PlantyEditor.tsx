import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin";

import { lexicalConfig } from "./editorConfig";
import { BASIC_TRANSFORMERS } from "./markdownTransformers";

import { WikiLinkPlugin } from "./plugins/WikiLinkPlugin";
import { CtrlKeyBindingsPlugin } from "./plugins/CtrlKeyBindingsPlugin";
import { EditorPersistencePlugin } from "./plugins/EditorPersistencePlugin";
import { UrlAutoLinkPlugin } from "./plugins/UrlAutoLinkPlugin";
import { LinkSecurityPlugin } from "./plugins/LinkSecurityPlugin";

import "./planty-editor.css";
import "./checklist.css";

type PlantyEditorProps = {
  noteKey: string;
  initialMarkdown: string;
  onMarkdownChange: (markdown: string) => void;
  onWikiLinkClick: (path: string) => void;
};

/**
 * Lexicalベースのエディタを初期化し、Planty Wiki特有のプラグインやプレースホルダーを組み合わせたUIを提供する。
 *
 * @param props.noteKey ノート切り替え検知に使う安定したキー
 * @param props.initialMarkdown 初期Markdown本文
 * @param props.onMarkdownChange エディタ内容が変化したときの通知コールバック
 * @param props.onWikiLinkClick Wikiリンクをクリックしたときに遷移させるハンドラ
 * @returns LexicalエディタのコンテナJSX
 */
export function PlantyEditor({
  noteKey,
  initialMarkdown,
  onMarkdownChange,
  onWikiLinkClick,
}: PlantyEditorProps) {
  return (
    <LexicalComposer initialConfig={lexicalConfig}>
      <div class="lexical-editor-root">
        <RichTextPlugin
          contentEditable={
            <ContentEditable className="lexical-editor-content" spellCheck={false} />
          }
          placeholder={<div class="lexical-editor-placeholder">Type your note here</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ListPlugin />
        <CheckListPlugin />
        <TabIndentationPlugin />
        <WikiLinkPlugin onWikiLinkClick={onWikiLinkClick} />
        <UrlAutoLinkPlugin />
        <ClickableLinkPlugin newTab />
        <LinkSecurityPlugin />
        <HistoryPlugin />
        <MarkdownShortcutPlugin transformers={BASIC_TRANSFORMERS} />
        <CtrlKeyBindingsPlugin />
        <EditorPersistencePlugin
          noteKey={noteKey}
          initialMarkdown={initialMarkdown}
          onMarkdownChange={onMarkdownChange}
        />
      </div>
    </LexicalComposer>
  );
}
