# Cloud Sync Phase 3 検証手順

## 目的

同じSiteを2台のクライアントで開き、1件のノートを保存・更新・差分取得できることを確認する。
Phase 3では、認証境界の詳細、オフライン対応、競合解決、複数ノートへの拡張は完了条件に含めない。

## リポジトリに用意したもの

- `functions/api/sync/notes/[noteId].ts` は、版番号と操作IDを使ってノートを保存または削除する。
- `functions/api/sync/changes.ts` は、変更連番を指定して差分を取得する。
- `functions/api/sync/schema.sql` は、SiteのD1へ作成するテーブルを定義する。
- APIは `oai-authenticated-user-email` の有無だけを認証確認に使い、メールアドレスによる利用者の分離は行わない。

## Siteで最初に行うこと

ChatGPT Sitesで現在のプロジェクトから保存済みの非公開レビュー版を作成する。
既存のアプリを保持し、D1バインディング名を `DB` にする。
認証済みのPhase 3 APIへの最初のリクエストで、`notes`、`operations`、`changes` の3テーブルを自動作成する。
`functions/api/sync/schema.sql` は手動適用や構成確認のための定義として保持する。

Siteの保存、D1設定、デプロイはChatGPTのWebまたはデスクトップアプリで行う。
ChatGPT Sitesに対する操作は、利用者の明示的な許可を得てから実施する。

## 2クライアントでの確認

同じSiteへ、ブラウザーAとブラウザーBから認証済み状態でアクセスする。
ブラウザーの開発者ツールで、次のリクエストを順番に実行する。

### 1. クライアントAで保存する

```js
const noteId = "550e8400-e29b-41d4-a716-446655440000";
const operationA = "650e8400-e29b-41d4-a716-446655440000";
const saveA = await fetch(`/api/sync/notes/${noteId}`, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    path: "/pages/Phase 3 test",
    title: "Phase 3 test",
    body: "# Client A",
    deleted: false,
    operationId: operationA,
    baseVersion: 0,
  }),
});
console.log(saveA.status, await saveA.json());
```

`200` と `version: 1`、`changeSequence: 1` が返ることを確認する。

同じ操作IDと内容で再送し、同じ成功応答が返ることも確認する。

### 2. クライアントBで取得する

```js
const changesB = await fetch("/api/sync/changes?after=0&limit=100");
console.log(changesB.status, await changesB.json());
```

`200` と、本文が `# Client A` の `upsert` 変更が返ることを確認する。

### 3. クライアントBで更新する

```js
const noteId = "550e8400-e29b-41d4-a716-446655440000";
const operationB = "650e8400-e29b-41d4-a716-446655440001";
const saveB = await fetch(`/api/sync/notes/${noteId}`, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    path: "/pages/Phase 3 test",
    title: "Phase 3 test",
    body: "# Client B",
    deleted: false,
    operationId: operationB,
    baseVersion: 1,
  }),
});
console.log(saveB.status, await saveB.json());
```

`200` と `version: 2`、`changeSequence: 2` が返ることを確認する。

### 4. クライアントAで更新を取得する

```js
const changesA = await fetch("/api/sync/changes?after=1&limit=100");
console.log(changesA.status, await changesA.json());
```

`200` と、本文が `# Client B` の `upsert` 変更が返ることを確認する。

## 記録テンプレート

Site固有のURL、保存済みバージョン、実施日時はGit管理外の
`docs/Cloud Sync Phase 3.local.md` に記録する。

検証日: 2026-09-28

保存済みバージョンまたはコミット: v9 / `d65ecd76dfdae0647ba09f74610619604c017361`

Site URL: Git管理外の `docs/Cloud Sync Phase 3.local.md` に記録した。

D1バインディング: `DB`

| 確認項目 | 結果 | 証跡・補足 |
| --- | --- | --- |
| クライアントAがノートを保存できる | 確認済み | `version: 1`、`changeSequence: 1` が返った。 |
| クライアントBがノートを取得できる | 確認済み | `after=0` で `# Client A` の変更を取得できた。 |
| クライアントBが同じノートを更新できる | 確認済み | `version: 2`、`changeSequence: 2` が返った。 |
| クライアントAが更新結果を取得できる | 確認済み | `after=1` で `# Client B` の変更を取得できた。 |
| 同じ操作IDの再送が冪等に処理される | 確認済み | 再送時も `version: 1`、`changeSequence: 1` が返った。 |

## Phase 3の判定

API実装、自動テスト、Sites上の2クライアント検証が完了した。
検証結果とSite固有の情報は、Git管理外の `docs/Cloud Sync Phase 3.local.md` に記録した。

## Phase 4とPhase 5への引き継ぎ

- Phase 4では、API呼び出しに失敗してもローカルノートを利用できる起動・保存経路を追加する。
- Phase 5では、現在のAPIを画面とWorkerの同期処理へ接続し、複数ノートと削除を扱う。
- 認証済み利用者の詳細な認可、未認証応答、許可外利用者の遮断は後続のアクセス境界検証で確認する。
- 競合時にサーバー版とローカル版を保持し、利用者が解決する処理はPhase 6へ引き継ぐ。
