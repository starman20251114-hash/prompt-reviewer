# prompt-reviewer Local Trial

ローカル試用版は、build 済みの UI を Hono サーバーが配信する単一のローカル Web アプリとして起動します。

## 必要環境

- Node.js 20+
- pnpm 9+

## ローカル試用の起動

初回セットアップ:

```bash
pnpm setup:local
```

上記で以下をまとめて実行します。

- 依存パッケージのインストール
- `@prompt-reviewer/core` の build
- `@prompt-reviewer/ui` の build
- SQLite への migration

起動:

```bash
pnpm start:local
```

起動後はブラウザで `http://localhost:3000` を開いてください。

## データ保存先

ローカル試用版の SQLite DB は以下に作成されます。

```text
data/prompt-reviewer.sqlite
```

## 主要コマンド

```bash
# UI/core の build
pnpm build:local

# DB migration
pnpm migrate:local

# サンプルデータ投入
pnpm seed:local

# ローカル試用版の起動
pnpm start:local
```

## 環境変数

必要に応じて `.env.example` を参考に環境変数を設定できます。

| 変数名 | デフォルト値 | 説明 |
|---|---|---|
| `PORT` | `3000` | ローカル試用版サーバーのポート |
| `DB_PATH` | `./data/prompt-reviewer.sqlite` | SQLite DB ファイルの保存先 |
| `UI_DIST_DIR` | `./packages/ui/dist` | 配信する build 済み UI のディレクトリ |

`pnpm start:local` は `UI_DIST_DIR` に build 済み UI が存在しない場合は起動せず、`pnpm build:local` の実行を促します。

## 補足

- API は `/api/*` で配信されます
- UI は server 側から同一オリジンで配信されます
- 開発用の `pnpm dev` は従来どおり Vite (5173) + API server (3001) の分離起動です
