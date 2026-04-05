# AGENTS

## 共通
- コード規約を追加する前に、knipやbiomeでできないかを検討する

## コードレビュー
- ユーザーがレビューを依頼したときは `reviewer` エージェントを起動してレビューさせる
  - `reviewer` エージェントを起動できないときは、作業開始前に理由を報告する
- レビューでは、`AGENTS.md` と `docs/coding-standards.md` に記載されたコーディング規約に違反している箇所が一件もないことを確認する。
- レビュー結果は重大度順で、ファイルパスと行番号を付けて報告する
- 差分説明やレビュー対応では、変更意図・必要性・未対応時の影響を明確に説明し、今後の判断材料を共有する

## 利用可能なスキル
コーディングエージェントが利用可能なスキルは `.agents/skills/` に定義している。

- `review-doc-placement` スキルは、`AGENTS.md`、コード規約、仕様書、構文書、README などの配置確認ができる

## 作業の完了条件
- js/ts/tsx/cssを更新したあとは、`npm run verify` を実行してパスすることを確認する
- `*.ts` か `*.tsx` を変更した際は `npm run tsdoc-extract -- <relative-path>` コマンドを実行し、その出力について以下を確認する
    - `@param` で型注釈（`{Type}`）を使わないこと
    - タグ順序を `概要 -> @param -> @returns` に固定すること

## Git
- コミットメッセージ
    - 必ず英語で書く
- pull requestのタイトルも英語で作成する

## Planty-Wiki
- 詳細な仕様は `docs/planty-wiki specification.md` に記載する
- MarkdownエディタやWiki機能を変更したときは、必ず `docs/planty-wiki markdown syntax.md` に反映する。
