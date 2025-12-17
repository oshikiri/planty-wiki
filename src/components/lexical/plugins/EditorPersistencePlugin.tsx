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
 * ノート切り替え時のMarkdown import/exportと履歴クリアを担い、autosave中の再レンダリングでキャレットが飛ばないようにする。
 *
 * @param props.noteKey Lexical側へ渡すノート識別キー
 * @param props.initialMarkdown 読み込む初期Markdown
 * @param props.onMarkdownChange エディタ本文変更を親へ通知するコールバック
 * @returns null（プラグインとして副作用のみ行う）
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
      // 同じノートのautosaveだけの場合はキャレットが先頭へ飛ぶのを防ぐためimportをスキップする
      return;
    }
    previousNoteKeyRef.current = noteKey;
    editor.update(() => {
      $convertFromMarkdownString(initialMarkdown ?? "", BASIC_TRANSFORMERS);
    });
    // ノート切り替えが起きたタイミングだけ履歴スタックをクリアし、Undo/Redoが他ノートへ漏れないようにする
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
