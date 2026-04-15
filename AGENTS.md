# prompt-reviewer

Codex 向けのリポジトリ運用ガイド。

## 概要

- システムプロンプトを固定のテストケースに対して繰り返し改善するツール
- テストケースに対してシステムプロンプトを実行、採点、改善するサイクルを回す
- フェーズ1は手動スコア中心で、フェーズ2で LLM 接続を追加する
- UI / サーバー / ストレージを分離し、ホスト環境だけ差し替え可能

## 技術スタック

- UI: React + Vite SPA
- サーバー: Hono
- ORM: Drizzle
- ストレージ: SQLite を中心に、将来的に PostgreSQL などへ切り替え可能

詳細仕様は `doc/spec.md` を参照。

## 環境メモ

- Python は `uv` で導入済み
- `better-sqlite3` のビルドに利用可能
- `@libsql/client` などへの置き換えは不要

## UI 実装ルール

- ページコンポーネントのスタイルはインラインスタイルを使わず `PageName.module.css` に分離する
- カラーパレットは `.root` クラス内の CSS カスタムプロパティで定義する
- `packages/ui/src/vite-env.d.ts` は削除しない

## ハマりやすいポイント

### drizzle-kit の schema はグロブ不可

`drizzle.config.ts` ではグロブではなく配列で個別指定すること。

```ts
schema: [
  "./src/schema/projects.ts",
  "./src/schema/test-cases.ts",
  "./src/schema/prompt-versions.ts",
  "./src/schema/runs.ts",
]
```

### better-sqlite3 を使うテスト

- Vitest から DB 接続まで行うとネイティブビルド起因で不安定になりやすい
- スキーマのテストは `expectTypeOf` を使った型検証中心にする
- 実マイグレーションの確認は `pnpm --filter @prompt-reviewer/core migrate` で行う

## 作業手順

### 1. 前準備

- `master` ブランチに移動する
- `origin/master` の最新を取り込む
- `master` から対象 Issue 用ブランチを切る

### 2. Worktree

- `worktrees/` 配下に作業ディレクトリを作る
- 対象ブランチをその worktree にチェックアウトする
- worktree 側で `git config core.hooksPath ../../.husky` を実行する

### 3. 実装

- Issue 内容を確認してから実装する
- 実装後はテスト、型チェック、Lint を通す

### 4. PR

- 変更をコミットして push する
- GitHub で PR を作成する

### 5. 後処理

- メインディレクトリに戻る
- Issue の完了報告コメントを投稿する
- テスト計画や完了条件が Issue にある場合は確認結果も記載する

## 基本コマンド

```bash
pnpm install
pnpm --filter @prompt-reviewer/core build
pnpm --filter @prompt-reviewer/core migrate
pnpm dev
pnpm run check
pnpm run typecheck
pnpm run test
```
