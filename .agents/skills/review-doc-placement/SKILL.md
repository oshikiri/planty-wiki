---
name: review-doc-placement
description: Review whether statements in repository documents are placed in the correct file. Use when checking or reorganizing AGENTS.md, docs/coding-standards.md, specifications, syntax guides, README files, or directory-scoped AGENTS.md to decide where each rule, requirement, example, or workflow note belongs.
---

# Review Doc Placement

## Overview

記述の種類を分類して、適切な配置先を判断する。
配置ミス、文書間の重複、境界の曖昧さを見つけたら、移動先と理由をセットで示す。

## Workflow

1. 対象文書を確認する。
2. `references/doc-placement-guide.md` を読み、記述の種類ごとの配置先を確認する。
3. 各記述を分類し、現在の配置が適切かを判断する。
4. 問題があれば、優先度順で現在位置、移動先、理由を報告する。
5. 実際に修正する場合は、小さい差分で移動し、移動元と移動先の重複や矛盾を再確認する。

## Review Focus

- 文書ごとの責務が保たれているかを確認する。
- 同じ主題の記述が複数文書に重複していないかを確認する。
- 仕様と実装規約、運用ルールとユーザー向け説明が混ざっていないかを確認する。
- ある文書で参照に留めるべき内容を抱え込みすぎていないかを確認する。
- 対象文書に固有の詳細は、その文書か配下専用の `AGENTS.md` に閉じているかを確認する。

## Reporting Rules

- 配置ミスを報告するときは、現在のファイルと移動先のファイルを明記する。
- 記述を移す理由は、文書の責務の違いで説明する。

## Reference

- 詳細な配置基準は `references/doc-placement-guide.md` を参照する。
