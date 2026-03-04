---
name: review-coding-standards-docs
description: docs/coding-standards.md の記述をレビューして改善するスキル。規約を追加・更新・監査するときに使い、判定可能性と適用範囲の明確さを高める。
---

# Review Coding Standards Docs

`docs/coding-standards.md` を対象に、レビューで判定できる規約へ整える。

## Workflow

1. `docs/coding-standards.md` を読み、章ごとの規約を把握する。
2. `references/coding-standards-writing-guide.md` を読み、適用観点を選ぶ。
3. 優先度順で問題を抽出する。
4. 小さい差分で文書を修正する。
5. 既存章との重複や矛盾がないことを全検索で確認する。
6. 変更内容と残リスクを報告する。

## Review Focus

- 各ルールが第三者でも同じ結論で判定できる粒度かを確認する。
- 各ルールに適用範囲と必要な例外条件が明示されているかを確認する。
- `必須` と `推奨` が区別されているかを確認する。
- 一つの箇条書きに複数要求が混在していないかを確認する。
- linterやテストで自動検出可能なルールは、そちらに寄せて規約を簡素化できないかを確認する。

## Edit Rules

- 判定基準が主観的な表現には条件を補足する。
- 重要なルールには理由を一文で補足する。
- 誤解しやすいルールには最小の具体例を付ける。
- 章名は実装単位に合わせて具体化する。

## Reference

- 詳細ガイドは `references/coding-standards-writing-guide.md` を参照する。
