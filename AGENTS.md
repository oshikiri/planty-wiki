# AGENTS

## 共通
- 意図が理解しやすい文章を書くこと
  - 用言止めは使わないこと
  - 文章は一文一義で書くこと
  - 長い修飾で読みにくくなるときは文を分割すること
- 既存のコードコメントは理由なく削除しないこと
- 作業の中でユーザーの許可なしで `npm install` は実行しないこと
- コード規約を追加する前に、knipやbiomeでできないかを検討する

## コードレビュー
- ユーザーがレビューを依頼したときは `reviewer` エージェントを起動してレビューさせる
  - `reviewer` エージェントを起動できないときは、作業開始前に理由を報告し、代替として `review` スキルでレビューする
  - レビュー結果は重大度順で、ファイルパスと行番号を付けて報告する
- `AGENTS.md` の記述改善には `review-agents-docs` スキルを使う
- `docs/coding-standards.md` の記述改善には `review-coding-standards-docs` スキルを使う
- 差分説明やレビュー対応では、変更意図・必要性・未対応時の影響を明確に説明し、今後の判断材料を共有する

## 利用可能なスキル
利用可能なスキルは `.agents/skills/` に定義している。

## 作業の完了条件
js/ts/tsx/cssを更新したあとは、以下を実行しすべてパスすることを確認する

- `npm run format`
- `npm run lint`
- `npm run knip`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `*.ts` か `*.tsx` を変更した際は `npm run tsdoc-extract -- <relative-path>` コマンドを実行し、その出力について以下を確認する
    - `@param` で型注釈（`{Type}`）を使わないこと
    - タグ順序を `概要 -> @param -> @returns` に固定すること

## Git
- コミットメッセージ
    - 必ず英語で書く
    - 書き方は conventional commit に従う
- pull requestのタイトルも英語で作成する

## Planty-Wiki
- 詳細な仕様は `docs/planty-wiki specification.md` に記載する
- MarkdownエディタやWiki機能を変更したときは、必ず `docs/planty-wiki markdown syntax.md` に反映する。
