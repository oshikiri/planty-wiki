---
name: apply-random-coding-rule
description: コーディング規約をランダムに適用してコードを改善するスキル。段階的なコードの品質向上を目的として使用する。　"random fix" キーワードで呼び出す（完全一致）。
---

## 手順
1. `docs/coding-standards.md` からランダムに一つのコーディング規約を抽出する。
  - `grep --perl-regexp '^- ' docs/coding-standards.md | shuf --head-count=1`
2. 抽出した規約の観点でリポジトリ内のすべてのコードをチェックする。
3. レビューしやすいように意識しつつ、最小限の差分でコードを修正する。
