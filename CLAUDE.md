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
