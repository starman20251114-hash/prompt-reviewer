-- runs テーブルを再作成して project_id 追加 + スコア関連カラムを scores テーブルへ分離
-- SQLite は ALTER TABLE DROP COLUMN が制限的なため、テーブル再作成で対応する

-- 1. 旧 runs テーブルのデータを一時テーブルへ退避
CREATE TABLE `runs_backup` AS SELECT * FROM `runs`;--> statement-breakpoint

-- 2. 旧 runs テーブルを削除
DROP TABLE `runs`;--> statement-breakpoint

-- 3. 新 runs テーブルを作成（project_id 追加、スコア関連カラム削除）
CREATE TABLE `runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `project_id` integer NOT NULL REFERENCES `projects`(`id`),
  `prompt_version_id` integer NOT NULL REFERENCES `prompt_versions`(`id`),
  `test_case_id` integer NOT NULL REFERENCES `test_cases`(`id`),
  `conversation` text NOT NULL,
  `is_best` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `model` text NOT NULL,
  `temperature` real NOT NULL,
  `api_provider` text NOT NULL
);--> statement-breakpoint

-- 4. バックアップデータを新テーブルへ移行
-- project_id は prompt_versions 経由で取得する
INSERT INTO `runs` (
  `id`, `project_id`, `prompt_version_id`, `test_case_id`,
  `conversation`, `is_best`, `created_at`, `model`, `temperature`, `api_provider`
)
SELECT
  b.`id`,
  pv.`project_id`,
  b.`prompt_version_id`,
  b.`test_case_id`,
  b.`conversation`,
  b.`is_best`,
  b.`created_at`,
  b.`model`,
  b.`temperature`,
  b.`api_provider`
FROM `runs_backup` b
JOIN `prompt_versions` pv ON b.`prompt_version_id` = pv.`id`;--> statement-breakpoint

-- 5. バックアップテーブルを削除
DROP TABLE `runs_backup`;--> statement-breakpoint

-- 6. scores テーブルを新規作成
CREATE TABLE `scores` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` integer NOT NULL REFERENCES `runs`(`id`),
  `human_score` integer,
  `human_comment` text,
  `judge_score` integer,
  `judge_reason` text,
  `is_discarded` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
