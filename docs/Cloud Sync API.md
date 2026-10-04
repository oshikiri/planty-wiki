# Cloud Sync API

## 位置づけ

この文書は、Cloud Syncの同期API契約とD1モデルを定義する。製品としての要求と同期方針は [[Cloud Sync]]、実装範囲と完了条件は [[planty-wiki scope]] に記載する。ChatGPT Sitesが提供する認証と実行環境の仕様は [[ChatGPT Sites]] に記載する。

- APIはフロントエンドと同じSiteの `/api/sync/` 配下に置く。
- Phase 2では、認証とD1接続を確認する `probe` だけを配置する。
- Phase 3では、ノート操作、差分同期、同期用D1スキーマを配置する。
- 実装は `functions/api/sync/` と `functions/api/sync/schema.sql` に置く。
- Phase 2の実サイト検証手順は [[Cloud Sync Phase 2]] に記載する。
- Phase 3の実サイト検証手順は [[Cloud Sync Phase 3]] に記載する。

## エンドポイント

| Phase | メソッドとパス | 用途 |
| --- | --- | --- |
| Phase 2 | `GET /api/sync/probe` | 認証とD1接続を確認する。 |
| Phase 3 | `PUT /api/sync/notes/:noteId` | ノートを版番号付きで保存または削除する。 |
| Phase 3 | `GET /api/sync/changes?after=<changeSequence>&limit=<limit>` | 指定した変更連番より後の変更を昇順で取得する。 |

すべてのエンドポイントで認証を必須とする。未認証またはSitesの認証状態を確認できない場合は、`401 Unauthorized` を返す。

Siteのアクセス設定を認可境界とし、アプリケーションは認証済み利用者をメールアドレスで区別しない。クライアントから受け取った利用者識別情報を認証判断に使わない。

## Phase 2のAPI

`GET /api/sync/probe` は認証確認後にD1で `SELECT 1` を実行する。成功時は次の形式を返し、ノート本文などの利用者データを返さない。

```json
{
    "ready": true
}
```

## Phase 3のノートAPI

### 更新

`PUT /api/sync/notes/:noteId` は `operationId` と `baseVersion` を必須とする。`noteId` はURLを正とし、本文内のIDを参照しない。

```json
{
    "path": "/pages/README",
    "title": "README",
    "body": "# README",
    "deleted": false,
    "operationId": "650e8400-e29b-41d4-a716-446655440000",
    "baseVersion": 0
}
```

### 削除

削除は別のDELETE APIを設けず、`deleted: true` のPUTとして送信する。サーバーはノートの既存のパス、タイトル、本文を保持したまま削除時刻を設定し、削除記録を変更ログへ追加する。

```json
{
    "deleted": true,
    "operationId": "650e8400-e29b-41d4-a716-446655440001",
    "baseVersion": 2
}
```

### 成功応答

更新または削除が成功した場合は `200 OK` とし、次の形式を返す。`version` と `changeSequence` は保存後の値である。

```json
{
    "noteId": "550e8400-e29b-41d4-a716-446655440000",
    "version": 3,
    "changeSequence": 12,
    "deleted": true,
    "operationId": "650e8400-e29b-41d4-a716-446655440001"
}
```

ノートの更新、変更ログへの追加、送信操作の記録は、同じD1トランザクションで実行する。

### 競合応答

`baseVersion` が現在のノート版番号と一致しない場合は、状態を変更せず `409 Conflict` を返す。レスポンスには、競合解決に必要なサーバー側のノート状態を含める。

```json
{
    "error": "conflict",
    "note": {
        "noteId": "550e8400-e29b-41d4-a716-446655440000",
        "version": 3,
        "changeSequence": 12,
        "path": "/pages/README",
        "title": "README",
        "body": "# Server version",
        "deleted": false,
        "updatedAt": "2026-09-20T12:00:00.000Z"
    }
}
```

### 冪等な再送

同じ `operationId` のリクエストを再送した場合、最初のリクエストと内容が同じであれば、最初に返した成功応答を再利用する。新しい版番号や変更連番は発行しない。

同じ `operationId` でノートID、`baseVersion`、削除状態、パス、タイトル、本文のいずれかが異なる場合は、状態を変更せず `409 Conflict` とし、`error` に `operation_id_reuse` を設定する。

## Phase 3の差分取得API

`GET /api/sync/changes` の `after` は指定した変更連番を含まない。省略時は `0` とし、初回同期ではすべての変更を対象とする。`limit` は省略時に `100` とし、`1` 以上 `100` 以下に制限する。

```json
{
    "changes": [
        {
            "changeSequence": 1,
            "noteId": "550e8400-e29b-41d4-a716-446655440000",
            "version": 1,
            "kind": "upsert",
            "path": "/pages/README",
            "title": "README",
            "body": "# README",
            "updatedAt": "2026-09-20T12:00:00.000Z"
        },
        {
            "changeSequence": 2,
            "noteId": "550e8400-e29b-41d4-a716-446655440001",
            "version": 3,
            "kind": "delete",
            "deletedAt": "2026-09-20T12:01:00.000Z",
            "updatedAt": "2026-09-20T12:01:00.000Z"
        }
    ],
    "nextAfter": 2,
    "hasMore": false
}
```

`changes` は `changeSequence` の昇順で返す。`nextAfter` は返却した最後の変更連番とし、変更がない場合はリクエストの `after` と同じ値にする。`hasMore` が `true` の場合は、`nextAfter` を次の `after` に指定して再取得する。`kind` が `upsert` の場合はノートの内容を返し、`delete` の場合は削除時刻を返す。

変更連番はSite全体で単調増加し、欠番を許容する。初期版では変更ログを削除しない。

各端末は最後に適用した `changeSequence` をローカルに保存する。変更ログの適用とカーソルの更新は、同じローカルトランザクションで行う。未送信の変更は、サーバーから受信した変更によって無条件に上書きしない。

## 入力制約

すべての制約はサーバー側で検証する。クライアントの検証だけを信頼しない。

| 項目 | 制約 |
| --- | --- |
| `noteId` | 小文字のUUID v4形式とする。 |
| `path` | NFC正規化した512文字以下の文字列とし、`/pages/` で始める。`.`、`..`、空のセグメント、制御文字、NUL文字を含めず、末尾に `/` を付けない。 |
| `title` | 空でない文字列とし、1024文字以下とする。削除リクエストでは省略できる。 |
| `body` | 50000文字以下の文字列とする。削除リクエストでは省略できる。 |
| `operationId` | 小文字のUUID v4形式とする。 |
| `baseVersion` | 0以上の整数とし、JSONで安全に扱える最大値を超えない。 |
| `after` | 0以上の整数とし、JSONで安全に扱える最大値を超えない。 |
| `limit` | 1以上100以下の整数とする。 |

更新リクエストでは `path`、`title`、`body`、`deleted: false` を必須とする。削除リクエストでは `deleted: true`、`operationId`、`baseVersion` を必須とし、`path`、`title`、`body` は受け付けない。サーバーは保存時にパスを正規化し、クライアントが送信した `updatedAt` や変更連番は無視する。

制約違反のリクエストは `400 Bad Request` を返し、次の形式とする。レスポンスにノート本文を含めない。

```json
{
    "error": "invalid_request",
    "field": "body"
}
```

## Phase 3のD1モデル

D1はSiteのアクセス設定で許可された利用者が共有するデータベースとして扱い、利用者識別用の列を持たせない。認証済みのPhase 3 APIへの最初のリクエストで、必要な3テーブルを `CREATE TABLE IF NOT EXISTS` により自動作成する。

```sql
CREATE TABLE notes (
    note_id TEXT NOT NULL,
    path TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    version INTEGER NOT NULL,
    change_sequence INTEGER NOT NULL,
    deleted_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (note_id),
    UNIQUE (path)
);

CREATE TABLE operations (
    operation_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (operation_id)
);

CREATE TABLE changes (
    change_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('upsert', 'delete')),
    path TEXT,
    title TEXT,
    body TEXT,
    deleted_at TEXT,
    updated_at TEXT NOT NULL
);
```


## Phase 6での入力上限

APIは更新を保存する前に、パス512文字、タイトル1024文字、本文50000文字の上限を検証する。上限を超えた場合は`400 Bad Request`を返し、ノート、変更ログ、操作記録を作成しない。
