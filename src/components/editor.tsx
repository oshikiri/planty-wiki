import type { Backlink } from "../hooks/useBacklinks";
import type { Note } from "../storage";
import { PlantyEditor } from "./lexical/PlantyEditor";
import styles from "./editor.module.css";

type EditorProps = {
  note: Note;
  noteRevision: number;
  onChangeDraft: (value: string) => void;
  statusMessage: string;
  isDirty: boolean;
  backlinks: Backlink[];
  onSelectPath: (path: string) => void;
};

/**
 * ノート1件分の編集UIとバックリンク表示をまとめて描画する。
 *
 * @param props.note 表示・編集対象のノート
 * @param props.noteRevision ノート差し替え時にLexicalエディタへ伝えるリビジョン番号
 * @param props.onChangeDraft エディタ変更時に呼び出されるMarkdown更新ハンドラ
 * @param props.statusMessage 画面下部に表示する最新ステータスメッセージ
 * @param props.isDirty ローカルのドラフトが未保存かどうか
 * @param props.backlinks 現在のノートを参照しているページ一覧
 * @param props.onSelectPath バックリンクから別ノートを開く際に使う選択ハンドラ
 * @returns エディタと付随情報を含むJSX
 */
export function Editor(props: EditorProps) {
  return (
    <section class={styles.editor}>
      <EditorHeader
        title={props.note.title || props.note.path}
        isDirty={props.isDirty}
        statusMessage={props.statusMessage}
      />
      <article class={styles.editorBody}>
        <PlantyEditor
          // autosaveではキーを変えないようにして、意図しないキャレット位置のリセットを防ぐ
          noteKey={`${props.note.path}:${props.noteRevision}`}
          initialMarkdown={props.note.body}
          onMarkdownChange={props.onChangeDraft}
          onWikiLinkClick={props.onSelectPath}
        />
        <BacklinksSection backlinks={props.backlinks} onSelectPath={props.onSelectPath} />
      </article>
    </section>
  );
}

function EditorHeader({
  title,
  isDirty,
  statusMessage,
}: {
  title: string;
  isDirty: boolean;
  statusMessage: string;
}) {
  return (
    <header class={styles.editorHeader}>
      <h1 class={styles.editorTitle}>{title}</h1>
      <div class={styles.editorControls}>
        <div class={styles.editorStatusBar}>
          <span
            class={`${styles.editorStatusIcon} ${isDirty ? styles.editorStatusIconDirty : styles.editorStatusIconClean}`}
            aria-hidden="true"
          />
        </div>
        {statusMessage ? (
          <output class={styles.editorStatus} aria-live="polite" aria-atomic="true">
            {statusMessage}
          </output>
        ) : null}
      </div>
    </header>
  );
}

function BacklinksSection({
  backlinks,
  onSelectPath,
}: {
  backlinks: Backlink[];
  onSelectPath: (path: string) => void;
}) {
  if (!backlinks.length) {
    return null;
  }
  return (
    <section class={styles.backlinksSection} aria-label="Backlinks">
      <h2 class={styles.backlinksTitle}>Backlinks</h2>
      <div class={styles.backlinksList}>
        {backlinks.map((backlink) => (
          <button
            key={backlink.path}
            type="button"
            class={styles.backlinksItem}
            onClick={() => onSelectPath(backlink.path)}
          >
            <span class={styles.backlinksItemTitle}>{backlink.title}</span>
            <span class={styles.backlinksItemSnippet}>{backlink.snippet}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
