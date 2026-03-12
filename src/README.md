# Source Architecture

## Layer Direction

- 依存方向は `domain -> usecases -> hooks -> components -> app` とする。
- 外側の層は内側へ依存してよい。逆方向の import は禁止する。
- 上記の依存方向は `../scripts/dependency-cruiser.mjs` で検証する。

## Directory Responsibilities

- `domain`: ノートやパスのドメインモデルを置く。
- `usecases`: ドメインモデルを使ったユースケースとポート定義を置く。
- `hooks`: UI から使うアプリケーション制御のフックを置く。
- `components`: 画面コンポーネントと Lexical エディタ関連の UI を置く。
- `app.tsx`: 画面を組み立てる最上位コンポーネントを置く。
