# AGENTS

## 共通
- コードコメントは英語で書くこと
- 意図が理解しやすい文章を書くこと
  - 用言止めは使わないこと
  - 文章は一文一義で書くこと
  - 長い修飾で読みにくくなるときは文を分割すること
- 作業の中で `npm install` は実行しないこと

## コードレビュー
- ユーザーがレビューを依頼したときは `reviewer` エージェントを起動してレビューさせる
  - `reviewer` エージェントを起動できないときは、作業開始前に理由を報告し、代替として `review` スキルでレビューする
  - レビュー結果は重大度順で、ファイルパスと行番号を付けて報告する
- `AGENTS.md` の記述改善には `review-agents-docs` スキルを使う
- `docs/coding-standards.md` の記述改善には `review-coding-standards-docs` スキルを使う

## 作業の完了条件
js/ts/tsx/cssを更新したあとは、以下を実行しすべてパスすることを確認する

- `npm run format`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`

## Git
- コミットメッセージ
    - 必ず英語で書く
    - 書き方は conventional commit に従う
- pull requestのタイトルも英語で作成する

## Planty-Wiki
- 詳細な仕様は `docs/planty-wiki specification.md` に記載する
- MarkdownエディタやWiki機能を変更したときは、必ず `docs/planty-wiki markdown syntax.md` に反映する。
- Markdownの記法ドキュメントでは少なくとも一つ以上の具体的な記述例を併記して、読み手がすぐに使い方を理解できるようにする。
  - 例: `## 見出し` と `[[PageLink]]`
