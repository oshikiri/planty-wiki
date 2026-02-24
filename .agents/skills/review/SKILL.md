---
name: review
description: コードレビューの際に守るべきルールやベストプラクティスをまとめたスキル。
---

`docs/coding-standards.md` に記載されたコーディング規約を遵守してコードレビューを行うこと。

js/ts/tsx/cssを更新したあとは、私に報告する前に以下を実行しすべてパスすることを確認する
- `npm run lint`
- `npm run typecheck`
- `npm run format`
- `npm run build`
- `npm test`
