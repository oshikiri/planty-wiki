# 機能要求

## 概要

- 技術スタックは、TypeScript、Preact、Vite、Lexical、OPFS上のSQLite WASMとする。
- 利用者に表示するUIラベル、プレースホルダー、ステータスメッセージ、通知は英語にする。
- 表示とルーティングは、次のとおりとする。
    - `/pages/[URL-encoded markdown file name]` の形式でルーティングする。
    - 存在しないページへルーティングした場合は、利用者が書き始められる空のページを作成する。
    - `/tools/query` でSQLクエリーページを開き、SELECTまたはWITHの結果を表で表示する。
- [[planty-wiki markdown syntax]]
- [[planty-wiki local storage]]
- [[planty-wiki security requirements]]
- [[planty-wiki scope]]
- [[Cloud Sync]]
- [[local-first principle]]

## 実行環境

- 対応ブラウザーはChrome>=142とする。
    - その他のブラウザーは動作未検証として扱う。
- ブラウザー終了時にデータが消えるため、シークレットモードとゲストモードは対応対象外とする。
- OPFSを利用できるように、HTTPSまたはlocalhostで配信する。

## Markdownエディター

- 検索やAPI呼び出しを伴うテキスト入力は300ms程度デバウンスする
    - リクエストIDなどで最新レスポンスのみをUIへ反映して結果の取り違えを防ぐようにする
- Tabキーの挙動はLexicalのTabIndentationPluginなど既定のインデント/アウトデントロジックを使う
    - カスタムプラグインでスペース挿入に置き換えないようにする
- Markdownのリストインデントは4スペースを前提とし、2スペース記法はサポート対象外とする。Tab入力やImport時も同ルールを徹底する
- Markdown文字列からの再インポートはノート切り替え時のみ行い、同じノートのautosaveではEditorStateを上書きせずキャレット位置を保持する

## Webアプリケーション

- フォームや検索入力ではplaceholderだけに頼らず、必ずlabelやaria-labelでスクリーンリーダーに説明を伝えるようにする
- ストレージやネットワークへの初期化処理では例外が発生してもUI全体が空白にならないようにtry/catchでフォールバックを実装するようにする
- バックリンク生成やノート一覧の描画など件数が増える処理は、全件スキャンやDOM全描画を続けずに早期に仮想リスト化やSQLiteインデックスを導入してメインスレッドをブロックしないようにする
- バックリンクやWikiリンクの参照関係はSQLiteのlinksテーブルなど補助構造に永続化し、UIはlistBacklinks等のストレージAPI経由で取得するようにして全件走査を避けること
- ディレクトリインポートやワーカー越しのストレージ操作など長時間処理には並列数の制御・深さ/件数上限・キャンセルプロトコルを必ず設計し、ブラウザをフリーズさせないようにする

## 配布

- ChatGPT Sitesでホスティングする。
- `docs/` 以下のMarkdownをアプリにバンドルし、`/pages/...` として表示する。
    - 同じ `/pages/...` パスを開いたときは、バンドルしたドキュメントを正とし、DBの内容より優先する。
    - バンドルしたドキュメントが未作成の場合は、空の本文ではなく、バンドルした本文でページを作成する。
- 公式のSQLite WASM成果物を `/public/sqlite3.{js,wasm}` に直接配置し、`sqlite-opfs-worker.js` と `sqlite3-opfs-async-proxy.js` とともに配布する。
    - sqlite3 WebAssembly & JavaScript Documentation Index https://sqlite.org/wasm/doc/trunk/index.md
