# prompt-reviewer

システムプロンプトを固定のテストケースに対して繰り返し改善するツール。

## 起動手順

### 必要環境

- Node.js 20+
- pnpm 9+

### セットアップ

```bash
# 依存パッケージのインストール
pnpm install

# コアパッケージのビルド（初回・core 変更時に必要）
pnpm --filter @prompt-reviewer/core build

# 環境変数の設定
cp .env.example .env
```

### データベースのセットアップ

初回起動前に、マイグレーションを実行してテーブルを作成してください。

```bash
pnpm migrate:dev
```

DBファイルはモノレポルート直下の `dev.db` に作成されます。

`pnpm dev` を使う場合は `pnpm migrate:dev` を使ってください。  
ローカル試用版の `data/prompt-reviewer.sqlite` に対して適用する場合は `pnpm migrate:local` を使います。

最新コードへ更新したあとに `DB schema is outdated` や `table runs has no column named execution_trace` が出る場合は、既存 DB に最新マイグレーションが当たっていません。使用中の DB に応じて次を実行してください。

```bash
pnpm migrate:dev
# または
pnpm migrate:local
```

> **サンプルデータを投入する場合**
> ```bash
> pnpm --filter @prompt-reviewer/core seed
> ```

### 開発サーバーの起動

```bash
pnpm dev
```

`pnpm dev` を実行すると、以下が同時に起動します。

| サービス | URL | 説明 |
|---|---|---|
| API サーバー (Hono) | http://localhost:3001 | バックエンド API |
| UI (Vite + React) | http://localhost:5173 | フロントエンド |

ブラウザで http://localhost:5173 を開くと UI にアクセスできます。

## ローカル試用版

build 済み UI を server から配信するローカル試用版も利用できます。

```bash
pnpm setup:local
pnpm start:local
```

`pnpm start:local` で既定ブラウザが自動で開きます。詳細は [README.local.md](README.local.md) を参照してください。

### 環境変数

`.env.example` をコピーして `.env` を作成し、必要に応じて値を変更してください。

| 変数名 | デフォルト値 | 説明 |
|---|---|---|
| `PORT` | `3001` | API サーバーのポート番号 |
| `DB_PATH` | `./data/prompt-reviewer.db` | SQLite データベースのパス |
| `VITE_API_BASE_URL` | `http://localhost:3001` | UI から参照する API のベース URL |

### その他のコマンド

```bash
# 型チェック
pnpm typecheck

# Lint / フォーマット
pnpm check
pnpm check:fix

# テスト
pnpm test
pnpm test:watch

# CI (lint + typecheck + test)
pnpm ci
```
