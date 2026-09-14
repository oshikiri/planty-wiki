# AGENTS

## 共通
- コード規約を追加する前に、knipやbiomeでできないかを検討する
- コミットメッセージは必ず英語で書く

## 作業の完了条件
- js/ts/tsx/cssを更新したあとは、`npm run verify` を実行してパスすることを確認する
- `*.ts` か `*.tsx` を変更した際は `npm run tsdoc-extract -- <relative-path>` コマンドを実行し、その出力について以下を確認する
    - `@param` で型注釈（`{Type}`）を使わないこと
    - タグ順序を `概要 -> @param -> @returns` に固定すること

## Planty-Wiki
- 詳細な仕様は `docs/planty-wiki specification.md` に記載する
- MarkdownエディタやWiki機能を変更したときは、必ず `docs/planty-wiki markdown syntax.md` に反映する。
