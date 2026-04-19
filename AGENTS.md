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

## Git / Worktree 必須ルール

- 新規 Issue 対応は必ず `master` を最新化してから、`master` ベースで対象 Issue 用ブランチを切る
- 実装・テスト・型チェック・Lint・コミット・push・PR 作成は、必ずその Issue 用 worktree 上で行う
- リポジトリのメインディレクトリで直接実装してはいけない
- 作業開始前に、現在の `cwd` が対象 Issue 用 worktree であることを必ず確認する
- 対象 Issue 用 worktree が存在しない場合は、実装前に `worktrees/` 配下へ作成する
- worktree 作成後は、その worktree で `git config core.hooksPath ../../.husky` を実行する
- worktree でテスト・型チェック・Lint を実行する前に、その worktree 自身で `pnpm install` を実行して `node_modules` を用意する
- 検証コマンドはメインディレクトリではなく、対象 worktree を `cwd` にして実行する

### 作業開始前チェック

- 対応対象の Issue 番号または PR 番号を確認する
- 新規 Issue 対応か、既存 PR へのレビュー指摘対応かを確認する
- 新規 Issue 対応なら `master` ベースの対象ブランチと worktree を用意する
- 既存 PR 対応なら、その PR に対応する既存ブランチと worktree を特定して入る
- 実装を始める前に、現在のブランチ名と `cwd` が正しいことを確認する

### 例外

- 既存 PR のレビュー指摘対応は、その PR に対応する既存ブランチ / worktree で作業してよい
- ユーザーが明示的に別ブランチや既存 worktree を指定した場合は、その指示を優先してよい

## 実装と仕上げ

- Issue 内容を確認してから実装する
- 実装後はテスト、型チェック、Lint を通す
- 変更をコミットして push する
- GitHub で PR を作成する
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
