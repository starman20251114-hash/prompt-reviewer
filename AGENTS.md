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
- 共通のカラートークン（`--c-bg`、`--c-accent` 等）は `packages/ui/src/styles/variables.css` の `:root` を正とする。ページ CSS の `.root` に同じ値をコピーしない
- ページ CSS では共通トークンを原則として再定義しない。ページ固有の色が必要な場合は、用途の分かる別名のローカルトークン（例: `--c-task-chip`）を `.root` に定義する
- 意図的なテーマ変更などで共通トークンを局所的に上書きする場合は、その理由をコメントで残す
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

### DB を使うテストの方針

- クエリ条件・絞り込み・制約など、実際の DB 動作を検証する統合テストでは in-memory SQLite を使う。DB は `packages/server/src/test-utils/create-test-db.ts` の `createTestDb()` で作成し、テストごとに作成して `afterEach` で閉じる（例: `packages/server/src/routes/runs.integration.test.ts`）
- DB を必要としない単体テスト（入力検証・レスポンス整形など）は、従来どおりモックを使ってよい
- モック DB は `where()` などの条件を無視して固定値を返すため、絞り込みの正しさは検証できない。テスト環境の問題を回避するためだけに、検出能力の低いモックテストへ置き換えない
- スキーマの型テストは `expectTypeOf` で行う
- 実 DB ファイルへのマイグレーション確認は `pnpm --filter @prompt-reviewer/core migrate` で行う

## Git / Worktree 必須ルール

- 新規 Issue 対応は必ず `master` を最新化してから、`master` ベースで対象 Issue 用ブランチを切る
- 実装・テスト・型チェック・Lint・コミット・push・PR 作成は、必ずその Issue 用 worktree 上で行う
- リポジトリのメインディレクトリで直接実装してはいけない
- 作業開始前に、現在の `cwd` が対象 Issue 用 worktree であることを必ず確認する
- 対象 Issue 用 worktree が存在しない場合は、実装前に `worktrees/` 配下へ作成する
- worktree 作成後は、その worktree で `git config core.hooksPath ../../.husky` を実行する
- worktree でテスト・型チェック・Lint を実行する前に、その worktree 自身で `pnpm install` を実行して `node_modules` を用意する
- 検証コマンドはメインディレクトリではなく、対象 worktree を `cwd` にして実行する

### Git 実行順序

- `git add`、`git commit`、`git push` は必ずこの順番で直列に実行する
- `git add` と `git commit`、`git commit` と `git push` を並列実行してはいけない
- `git add` の後は `git status --short` や `git diff --cached` でステージ状態を確認してから `git commit` する
- `git commit` の後はコミット成功を確認してから `git push` する
- worktree 配下の Git 操作で権限エラーが出た場合は、同じ順序を保ったまま必要なコマンドだけ権限昇格して再実行する

### GitHub 連携ツールの権限ルール

- GitHub 連携ツールで `403` や `Resource not accessible` などの権限エラーが出た場合、同じ操作を漫然と繰り返さない
- まず「権限不足なのか」「自分の PR なので GitHub 側の制約に引っかかったのか」を切り分ける
- Connector でレビュー投稿に失敗した場合は、必要に応じて `gh` CLI で代替できるか確認する
- 自分の PR では `Request changes` できないため、その場合は通常コメントで代替する
- 書き込み系操作の前に、どのツールで実行するかと必要権限を確認する

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
