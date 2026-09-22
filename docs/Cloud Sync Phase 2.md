# Cloud Sync Phase 2 検証手順

## 目的

ChatGPT Sites の認証付き D1 接続、同一オリジン API、現行アプリが必要とするブラウザー機能を確認する。ノート操作 API と同期用 D1 スキーマは Phase 3 で検証する。

## 現在の状態

Phase 2 は、今回の実現可能性検証の範囲では完了とする。許可された所有者ユーザーによるプローブと、認証済み同一オリジン API、D1 接続、ブラウザー機能の確認が完了している。

複数ユーザー、未認証アクセス、認証ヘッダー偽装は、後続フェーズのアクセス境界確認へ引き継ぐ。これらは未検証だが、Phase 2 の完了条件には含めない。

複数ユーザー検証は、検証用アカウントを用意できた時点で実施する。

## リポジトリに用意したもの

- `functions/api/sync/probe.ts` は、Site が付与した `oai-authenticated-user-email` を確認してから、D1 バインディング `DB` で `SELECT 1` を実行する。
- `public/probe.html` は `/probe.html` で開き、`probe.css` と `probe.js` を読み込んで、認証済みの同一オリジン API、OPFS、Worker、SharedArrayBuffer、Cross-Origin Isolation を確認する。
- Sites は `/probe.html` を `/probe` に正規化するため、Sites 専用 Worker が `/probe` をプローブHTMLへ変換してから静的アセットを返す。これにより、アプリ本体のSPAフォールバックを避ける。
- `.openai/hosting.json` は D1 バインディング名を `DB` として Site に関連付ける。

## Phase 2 で実施した手順

次の依頼文を Sites の作業チャットへ渡して、まず保存済みバージョンを作成する。

```text
@Sites Use the current project for the planty-wiki Phase 2 Cloud Sync feasibility check. Preserve the existing app, configure a D1 binding named DB, include the server route functions/api/sync/probe.ts, and save a private review version without deploying it. Report any route or runtime compatibility changes before making them.
```

1. `main` の最新コミットから Site の検証用バージョンを保存する。
2. Site のストレージ設定で D1 を有効にし、バインディング名を `DB` にする。
3. Site のアクセス設定を、検証対象の利用者だけがアクセスできる状態にする。公開設定にはしない。複数ユーザー検証を保留する場合は、所有者ユーザーだけの非公開設定を維持する。
4. 1人目のブラウザーで `/probe.html` を開き、全項目が成功することを確認する。

## Phase 3 で最初に確認すること

- [ ] 同じSiteを2台のクライアントで開き、両方から同期APIを利用できることを確認する。
- [ ] 1台目で1件のノートを保存し、2台目でそのノートを取得できることを確認する。
- [ ] 2台目で同じノートを更新し、1台目で更新結果を取得できることを確認する。

## 後続へ引き継ぐ確認

- [ ] 複数の許可された利用者が同じSiteを利用できることを確認する。
- [ ] サインアウト状態で `/api/sync/probe` を開き、`401` が返ることを確認する。
- [ ] 許可されていないアカウントで Site と API にアクセスできないことを確認する。
- [ ] API リクエストに `oai-authenticated-user-email` をクライアントから追加しても、Site の認証を迂回できないことを確認する。

## 記録テンプレート

Site固有の保存済みバージョン、コミット、URLは、Git管理外の `docs/Cloud Sync Phase 2.local.md` に記録する。

検証日: 2026-09-22

保存済みバージョンまたはコミット: ローカル記録を参照

Site URL: ローカル記録を参照

D1 バインディング: `DB`
アクセス設定: 所有者だけがアクセスできる非公開設定

| 確認項目 | 結果 | 証跡・補足 |
| --- | --- | --- |
| 認証済み `GET /api/sync/probe` が `200` と `{"ready":true}` を返す | 確認済み | 所有者ユーザーのプローブ画面で確認した。 |
| 未認証 API が `401` を返す | 後続フェーズで確認 | Phase 2の範囲外として引き継ぐ。 |
| 同じSiteを2台のクライアントから利用できる | Phase 3で確認 | まずは同じ利用者の2台のクライアントで確認する。 |
| 複数の許可された利用者が同じSiteを利用できる | 後続フェーズで確認 | 検証用の別ユーザーを用意できるまで引き継ぐ。 |
| 許可されていない利用者が Site と API を利用できない | 後続フェーズで確認 | Phase 2の範囲外として引き継ぐ。 |
| フロントエンドから同一オリジン API を呼び出せる | 確認済み | プローブ画面が `200` と `{"ready":true}` を表示した。 |
| OPFS が動作する | 確認済み | プローブ画面で `StorageManager.getDirectory succeeded` を確認した。 |
| Worker が動作する | 確認済み | プローブ画面でWorkerの起動とラウンドトリップを確認した。 |
| SharedArrayBuffer が利用できる | 確認済み | プローブ画面で確認した。 |
| Cross-Origin Isolation が有効である | 確認済み | プローブ画面で `crossOriginIsolated is true` を確認した。 |

## Phase 2 の判定

認証済み1ユーザーに対する基盤の実現可能性を確認できたため、Phase 2 は完了とする。複数ユーザー、未認証アクセス、認証ヘッダー偽装は後続フェーズで確認する。

## 完了条件

次のすべてを確認できたため、Phase 2 の完了条件を満たす。

- 認証済み API と D1 接続が確認できる。
- OPFS、Worker、SharedArrayBuffer、Cross-Origin Isolation が利用できる。

Sites の保存・デプロイ操作は ChatGPT の Web またはデスクトップアプリで行う。Codex CLI だけでは実サイトの保存、D1 設定、アクセス設定、デプロイ結果を確認できない。
