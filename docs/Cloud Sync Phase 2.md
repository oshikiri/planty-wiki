# Cloud Sync Phase 2 検証手順

## 目的

ChatGPT Sites の認証境界、D1 バインディング、同一オリジン API、現行アプリが必要とするブラウザー機能を確認する。ノート操作 API と同期用 D1 スキーマは Phase 3 で検証する。

## リポジトリに用意したもの

- `functions/api/sync/probe.ts` は、Site が付与した `oai-authenticated-user-email` を確認してから、D1 バインディング `DB` で `SELECT 1` を実行する。
- `public/probe.html` は `/probe.html` で開き、`probe.css` と `probe.js` を読み込んで、認証済みの同一オリジン API、OPFS、Worker、SharedArrayBuffer、Cross-Origin Isolation を確認する。
- `.openai/hosting.json` は D1 バインディング名を `DB` として Site に関連付ける。

## Sites で実施する手順

次の依頼文を Sites の作業チャットへ渡して、まず保存済みバージョンを作成する。

```text
@Sites Use the current project for the planty-wiki Phase 2 Cloud Sync feasibility check. Preserve the existing app, configure a D1 binding named DB, include the server route functions/api/sync/probe.ts, and save a private review version without deploying it. Report any route or runtime compatibility changes before making them.
```

1. `main` の最新コミットから Site の検証用バージョンを保存する。
2. Site のストレージ設定で D1 を有効にし、バインディング名を `DB` にする。
3. Site のアクセス設定を、検証対象の2名だけがアクセスできる状態にする。公開設定にはしない。
4. 1人目のブラウザーで `/probe.html` を開き、全項目が成功することを確認する。
5. 2人目のブラウザーでも同じ URL を開き、全項目が成功することを確認する。
6. サインアウト状態で `/api/sync/probe` を開き、`401` が返ることを確認する。
7. 許可されていないアカウントで Site と API にアクセスできないことを確認する。
8. API リクエストに `oai-authenticated-user-email` をクライアントから追加しても、Site の認証を迂回できないことを確認する。
9. Site の保存済みバージョンを2つのブラウザーで確認した後、必要ならそのバージョンをデプロイする。

## 記録テンプレート

検証日: YYYY-MM-DD  
保存済みバージョンまたはコミット: `<value>`  
Site URL: `<value>`  
D1 バインディング: `DB`  
アクセス設定: `<value>`

| 確認項目 | 結果 | 証跡・補足 |
| --- | --- | --- |
| 認証済み `GET /api/sync/probe` が `200` と `{"ready":true}` を返す | 未検証 |  |
| 未認証 API が `401` を返す | 未検証 |  |
| 許可された2名が2つのブラウザーから Site を利用できる | 未検証 |  |
| 許可されていない利用者が Site と API を利用できない | 未検証 |  |
| フロントエンドから同一オリジン API を呼び出せる | 未検証 |  |
| OPFS が動作する | 未検証 |  |
| Worker が動作する | 未検証 |  |
| SharedArrayBuffer が利用できる | 未検証 |  |
| Cross-Origin Isolation が有効である | 未検証 |  |

## 判定

次のすべてを確認できた場合に Phase 2 の完了条件を満たす。

- 認証済み API と D1 接続が確認できる。
- 2つのブラウザーから同じ Site の API を利用できる。
- OPFS、Worker、SharedArrayBuffer、Cross-Origin Isolation が利用できる。

Sites の保存・デプロイ操作は ChatGPT の Web またはデスクトップアプリで行う。Codex CLI だけでは実サイトの保存、D1 設定、アクセス設定、デプロイ結果を確認できない。
