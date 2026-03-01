# AGENTS

## 共通
- コードコメント、コミットメッセージ、pull requestのタイトルは英語で書くこと
- 意図が理解しやすい文章を常に書くこと
  - 体言止めは使わないこと。文章や箇条書きも動詞終わりにする。
  - 文章を書くときは一文一義を徹底する。長い修飾で読みにくくなったら即座に文を分割して読み手の負荷を減らすこと
- 作業の中で `npm install` は実行しないこと
- ローカル環境でレビューを行う際は `reviewer` エージェントを立ち上げてレビューさせる

## 作業の完了条件
js/ts/tsx/cssを更新したあとは、以下を実行しすべてパスすることを確認する

- `npm run lint`
- `npm run typecheck`
- `npm run format`
- `npm run build`
- `npm test`

## Git
- コミットメッセージ
    - 必ず英語で書く
    - 書き方は conventional commit に従う

## Planty-Wiki
- 詳細な仕様は `docs/planty-wiki specification.md` に記載する
- MarkdownエディタやWiki機能を変更したときは、必ず[[planty-wiki markdown syntax]]に反映する。
- Markdownの記法ドキュメントでは少なくとも一つ以上の具体的な記述例を併記して、読み手がすぐに使い方を理解できるようにする。
  - 例: `## 見出し` と `[[PageLink]]`
