# AGENTS

## 共通
- コード規約を追加する前に、knipやbiomeでできないかを検討する
- コミットメッセージは必ず英語で書く

## コーディング規約

### 一般的なコーディング
- モジュールの責務が2つ以上になっている場合は、命名と責務が一致するように分割もしくは改名すること
- デフォルト値やシードデータは定数としてまとめ、複数箇所で重複させないこと
- 1つの関数内で、処理方針を決める分岐とその詳細手順を書かないこと。詳細手順が必要な場合は名前付きの補助関数へ切り出すこと

### JSX
- 長くなったuseEffect/useCallbackは、専用フックへ切り出して本体を簡潔に保つこと
- Reactなどのリスト描画では、セクションが分かれていてもkeyが衝突しないようprefixを付けるなどして常に一意になるようにすること

### Lexical
- Lexical固有のスタイルはcomponents/lexical配下の専用CSSに集約し、クラス名は `lexical-` 接頭辞で統一する
- Lexicalのカスタムプラグインは`components/lexical/plugins/`配下へ集約し、エディタ本体からはそのディレクトリ経由でimportする

## 作業の完了条件
- js/ts/tsx/cssを更新したあとは、`npm run verify` を実行してパスすることを確認する

## Planty-Wiki
- 要求は `docs/planty-wiki requirements.md` に記載する
    - MarkdownエディタやWiki機能を変更したときは、必ず `docs/planty-wiki markdown syntax.md` に反映する。

## ChatGPT Sites

- ChatGPT Sites に関する操作は、必ずユーザーの明示的な許可を得てから行う
