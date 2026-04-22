# prompt-reviewer

システムプロンプトを固定のテストケースに対して繰り返し改善するツール。

## 概要

- テストケース（入力 + 期待記述）に対してシステムプロンプトを実行・採点・改善するサイクルを回す
- LLMなしでも動作する（手動スコアのみのフェーズ1から開始）
- スタンドアロン（SQLite）とクラウド（PostgreSQL）を切り替え可能

## 主要概念

| 概念 | 説明 |
|---|---|
| TestCase | マルチターン対応の入力 + `{{context}}` プレースホルダー + 期待記述（任意） |
| PromptVersion | システムプロンプトのバージョン。分岐・メモ付きで全履歴保持 |
| Run | バージョン×ケースの実行結果。複数回保持、ベスト回答フラグあり |
| Score | 1〜5点の人間スコア（個別/一括）+ フェーズ2でLLM Judge追加 |

## 実装フェーズ

- **フェーズ1**：プロジェクト/テストケース/プロンプト管理 + 手動スコア
- **フェーズ2**：LLM接続（Run実行 / Judge / Improve提案）
- **フェーズ3**：ダミーモード / コンテキストViewer・Editor / エクスポート

## 技術スタック

**UI / サーバー / ストレージを分離**し、ホスト環境だけを差し替える設計。

| 層 | 技術 | 理由 |
|---|---|---|
| UI | React + Vite SPA | Tauri・Web・拡張機能すべてに対応 |
| サーバー | Hono | Node.js / Bun / Cloudflare Workers で同一コードが動く |
| ORM | Drizzle | SQLite / D1 / PostgreSQL をアダプタで切り替え |

**デプロイターゲット**：ローカル（Hono + SQLite）/ Tauri / Webアプリ / Chrome拡張（Sidepanel + IndexedDB）

## 詳細仕様

→ [`doc/spec.md`](doc/spec.md)

## 環境情報

- **Python**: `uv` でインストール済み。`better-sqlite3` などネイティブモジュールのビルドに使用可能。代替パッケージ（`@libsql/client` 等）に切り替える必要はない。

## UIスタイリング規則

- ページコンポーネントのスタイルはインラインスタイルを使わず、`PageName.module.css` に分離すること
- カラーパレットは `.root` クラス内のCSSカスタムプロパティ（`--c-bg`、`--c-accent` 等）として定義する
- `packages/ui/src/vite-env.d.ts`（`/// <reference types="vite/client" />`）がないとCSSモジュールの型が解決されないため、必ず作成すること

## ハマりやすいポイント

### drizzle-kit のスキーマ指定はグロブ不可

`drizzle-kit` は CJS で動作するため、`drizzle.config.ts` のスキーマにグロブパターンを使うとエラーになる。
ファイルを配列で個別指定すること。

```ts
// NG
schema: "./src/schema/*.ts"

// OK
schema: [
  "./src/schema/projects.ts",
  "./src/schema/test-cases.ts",
  "./src/schema/prompt-versions.ts",
  "./src/schema/runs.ts",
],
```

### better-sqlite3 のテストはDB接続しない

`better-sqlite3` はネイティブバイナリのビルドが必要なため、Vitest からDBに接続するとビルドエラーになりやすい。
スキーマのテストは `expectTypeOf` による型検証のみとし、実際のマイグレーション動作は `pnpm run migrate` で別途確認する。

## 実装手順

> **重要**: エージェントシステムが `claude/...` 形式のブランチを持つworktreeに自動配置した場合でも、以下の全手順を省略せずに実行してください。特に Step 1 のブランチ作成と Step 5 の後処理（Issueコメント投稿）は必須です。

### 1. 前準備（Worktree作成前）
- 現在のブランチがmasterでなければ、masterブランチをチェックアウトしてください。
- **必ず** `git fetch origin && git pull origin master` でリモートの最新masterを取得してから作業を開始してください。ローカルのmasterが古いままブランチを切ると、マージ済みの変更が欠落します。
  - **すでにworktreeに配置されている場合**: `git fetch origin master` でリモートを最新化した上で、`git checkout -b issue-番号-内容 origin/master` でworktree内にissueブランチを作成してください（`master` ではなく `origin/master` を起点にすること）。
- 最新のmasterブランチからIssueに対応するブランチを作成してください。ブランチ名は `issue-番号-内容` の形式にしてください（例: `issue-118-runs-api-migration`）。

### 2. Worktree作成と環境構築
- worktrees/の下にディレクトリを作成して、Issueに対応するブランチをチェックアウトしてください。
- 作成したディレクトリに移動してください。
- `git config core.hooksPath ../../.husky`を実行してHuskyのパスを設定してください（Husky v9では`husky install`が廃止されたため）。
  - **すでにworktreeに配置されている場合も必ず実行してください。**

### 3. 実装
- Issue内容を確認して実装してください。use context7
- 実装完了後、必ずテストを実行して、問題があれば修正してください。
- `pnpm run check`と`pnpm run typecheck`でコード品質を確認して、問題があれば修正してください。

### 4. プルリクエスト作成
- 変更をコミットして、リモートにプッシュしてください。
- プルリクエストを作成してください。

### 5. 後処理
- プルリクエスト作成後、メインのディレクトリに戻ってください。
- **作業が完了したことをIssueにコメントで報告してください。** Issueにテスト計画や完了条件が記載されている場合は、その確認結果についても記載してください。この手順は省略禁止です。