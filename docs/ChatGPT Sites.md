# ChatGPT Sitesの仕様

## 位置づけ

この文書は、ChatGPT Sitesをplanty-wikiのホスティングとCloud Syncの基盤として検討するための前提資料である。ここではSitesの公式仕様を整理し、planty-wiki固有の設計判断は [[Cloud Sync]]、同期APIの契約は [[Cloud Sync API]] に記載する。

確認日: 2026-09-20

## ホスティングと公開

- Sitesは公開ベータ版である。利用できるプランと利用上限は、契約プランによって異なる。
- 新しいSiteには所有者とワークスペース管理者がアクセスできる。設定によって、選択した利用者、招待した閲覧者、ワークスペース全体、インターネット全体へ対象を広げられる。
- Siteのアクセス設定と、Site内に実装するサインイン機能は別の制御である。

## 認証

- サインインとサインアウトには、Sitesが提供する次のパスを使用する。

```html
<a href="/signin-with-chatgpt">Sign in with ChatGPT</a>
<a href="/signout-with-chatgpt">Sign out</a>
```

- サインイン後、Sitesはサーバーへのリクエストに次のヘッダーを付与する。
    - `oai-authenticated-user-email`: 認証済みメールアドレス
- 認証ヘッダーの具体的な到達方法と、Siteのアクセス設定が同期APIへ適用される範囲は、実サイトで確認する。

## 永続ストレージ

- D1は、構造化された永続データを保存するSQLite互換データベースである。
- SiteにはD1のバインディングを設定できる。
- D1のストレージ上限は1 Siteあたり10 GBである。

## planty-wiki Phase 2での検証対象

Phase 2では、リポジトリの `functions/api/sync/probe.ts` と `public/probe.html` を使って、認証付き D1 接続、同一オリジン API、OPFS、Worker、SharedArrayBuffer、Cross-Origin Isolation を確認する。具体的な手順と記録形式は [[Cloud Sync Phase 2]] に記載する。

## 実行環境

- 現行アプリが必要とするOPFS、Worker、SharedArrayBuffer、Cross-Origin Isolationは、Sites上で個別に動作確認する必要がある。
- サーバーAPIのルーティング方式とD1への具体的なアクセス方法は、Sites上で保存した検証用バージョンを使って確認する。

## 制約と運用上の前提

- Sitesは、提供開始時点でデータレジデンシーに対応していない。
- 利用上限に達すると、Siteの作成、ストレージ追加、公開継続などが制限される場合がある。
- Sitesの仕様変更やアカウントごとの利用可否は、実際の管理画面で確認する。

## 公式資料

- [Sites – ChatGPT](https://learn.chatgpt.com/docs/sites)
- [内部アプリの構築とデプロイ](https://developers.openai.com/ja-JP/use-cases/build-and-deploy-internal-apps)
