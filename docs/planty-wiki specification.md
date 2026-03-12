# Functional Requirements

## Overview

- Tech stack: TypeScript + Preact + Vite + Lexical + SQLite WASM on OPFS.
- Use English for UI labels, placeholders, status messages, and notifications shown to users.
- Display and routing:
    - Route with `/pages/[URL-encoded markdown file name]`.
    - Create an empty page when routing to a missing page so users can start writing.
    - Open the SQL query page at `/tools/query` and display SELECT or WITH results in a table.

## Runtime Environment

- Supported browser: Chrome>=142.
    - Treat other browsers as unverified.
- Do not support incognito or guest mode because data disappears on browser exit.
- Use a single browser because automatic sync across browsers is not possible.
- Serve over HTTPS or localhost to enable OPFS.

## Storage and Sync

- Validate and insert import or bulk-save input records one by one.
    - Fail the entire transaction when an invalid record is found so invalid data never enters the DB.
- Show a confirmation dialog or an undo bar in delete UIs so data is not removed immediately by mistake.
- Keep a failed diff instead of discarding it so it can be saved again after recovery.
- Store data in SQLite WASM as an intermediate table and read and write there in normal operations.
- Provide a feature that imports Markdown from a user-selected local directory.
- Clear the existing SQLite database and overwrite it with the imported content when importing from a Markdown folder.
- Auto-save and apply changes to SQLite when input pauses for a few seconds during editing.
- Run Markdown export only when the Export button is pressed, and do not run it during normal auto-save.
- Ignore the file side on conflicts after import and overwrite with the DB by re-exporting.
- UIから参照していないDBテーブルやデータ構造は維持せず、不要になった時点で削除して責務をシンプルにする

## Markdown

- Support wiki links in the `[[Page]]` format, emphasize them in the body, and open the page on click.
- Do not support image embed syntax (`![alt](url)`), and store it as plain text.
    - Keep accepting `![...]` as a literal string for now, although image embeds may be supported later.
- Avoid custom Markdown extensions to maximize portability.
- See [[planty-wiki markdown syntax]] for details.

## Markdown Editor

- 検索やAPI呼び出しを伴うテキスト入力は300ms程度デバウンスする
    - リクエストIDなどで最新レスポンスのみをUIへ反映して結果の取り違えを防ぐようにする
- Tabキーの挙動はLexicalのTabIndentationPluginなど既定のインデント/アウトデントロジックを使う
    - カスタムプラグインでスペース挿入に置き換えないようにする
- Markdownのリストインデントは4スペースを前提とし、2スペース記法はサポート対象外とする。Tab入力やImport時も同ルールを徹底する
- Markdown文字列からの再インポートはノート切り替え時のみ行い、同じノートのautosaveではEditorStateを上書きせずキャレット位置を保持する

## Web Application

- フォームや検索入力ではplaceholderだけに頼らず、必ずlabelやaria-labelでスクリーンリーダーに説明を伝えるようにする
- ストレージやネットワークへの初期化処理では例外が発生してもUI全体が空白にならないようにtry/catchでフォールバックを実装するようにする
- バックリンク生成やノート一覧の描画など件数が増える処理は、全件スキャンやDOM全描画を続けずに早期に仮想リスト化やSQLiteインデックスを導入してメインスレッドをブロックしないようにする
- バックリンクやWikiリンクの参照関係はSQLiteのlinksテーブルなど補助構造に永続化し、UIはlistBacklinks等のストレージAPI経由で取得するようにして全件走査を避けること
- ディレクトリインポートやワーカー越しのストレージ操作など長時間処理には並列数の制御・深さ/件数上限・キャンセルプロトコルを必ず設計し、ブラウザをフリーズさせないようにする

## Web Security

- window.location.hashなどブラウザのロケーションAPIへユーザー入力を流すときは、`/pages/`などプレフィックスのスラッシュは保ったまま各セグメント単位でencodeURIComponentを適用してパストラバーサルやXSSを防止すること
- Wikiリンクや入力パスを扱う際はnormalizePath相当のロジックで`.`や`..`を解決し、常にルート起点の安全なパスだけを保存・遷移させること
- 外部ソース（Markdown importなど）から取り込むパスも必ずnormalizePath経由で検証し、危険な相対パスや制御文字を弾くこと

## Distribution

- Use static hosting on GitHub Pages.
- Bundle Markdown under `docs/` into the app and show it as `/pages/...`.
    - Treat bundled docs as the source of truth and prefer the bundled body over DB content when opening the same `/pages/...` path.
    - Create a missing bundled docs page with the bundled body on open instead of an empty body.
- Place official SQLite WASM artifacts directly under `/public/sqlite3.{js,wasm}` and distribute them with `sqlite-opfs-worker.js` and `sqlite3-opfs-async-proxy.js`.
- Do not support images or attachments at this time.
- Do not provide full-app installation or offline cache.
