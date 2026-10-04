# ChatGPT Sitesの実行環境

planty-wikiはChatGPT Sitesで配信する。Cloud Syncの設計は [[Cloud Sync]]、同期APIの契約は [[Cloud Sync API]] に記載する。

## ホスティングとアクセス制御

- フロントエンドと同期APIを同じSiteから配信する。
- Siteへのアクセス可否は、Siteのアクセス設定で制御する。
- Siteのアクセス設定と、Site内で使うサインイン機能は別の制御である。
- Siteの利用上限や利用可能な機能は、契約プランと管理画面の設定に従う。

## 認証

サインインとサインアウトには、Sitesが提供するパスを使う。

```html
<a href="/signin-with-chatgpt">Sign in with ChatGPT</a>
<a href="/signout-with-chatgpt">Sign out</a>
```

認証済みリクエストには、Sitesが `oai-authenticated-user-email` ヘッダーを付与する。同期APIはこのヘッダーで認証状態を確認し、アプリケーションは利用者をメールアドレスで分離しない。

## 永続ストレージとブラウザー機能

- 同期データはSiteに割り当てたD1データベースへ保存する。
- D1はSQLite互換のデータベースであり、Siteの設定でバインディングを指定する。
- ローカル保存にはOPFS、ストレージ処理と同期処理にはWorkerを使う。
- アプリはSharedArrayBufferとCross-Origin Isolationを必要とする。

利用可能な機能、容量、データレジデンシーなどの最新情報は、[Sitesの公式資料](https://learn.chatgpt.com/docs/sites) と[内部アプリの構築とデプロイ](https://developers.openai.com/ja-JP/use-cases/build-and-deploy-internal-apps)を参照する。
