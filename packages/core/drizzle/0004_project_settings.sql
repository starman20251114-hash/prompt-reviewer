-- project_settings テーブルを新規作成
-- プロジェクトごとのLLM設定（model / temperature / api_provider）を管理する
CREATE TABLE `project_settings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `project_id` integer NOT NULL REFERENCES `projects`(`id`),
  `model` text NOT NULL DEFAULT 'claude-opus-4-5',
  `temperature` real NOT NULL DEFAULT 0.7,
  `api_provider` text NOT NULL DEFAULT 'anthropic',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
