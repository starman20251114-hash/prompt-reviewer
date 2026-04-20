-- テストケースをプロジェクト独立資産モデルへ移行
-- 1. test_cases テーブルから project_id カラムを削除するため新テーブル作成
-- 2. 既存データを移行しつつ、test_case_projects 中間テーブルに関連を移す
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_test_cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`turns` text NOT NULL,
	`context_content` text DEFAULT '' NOT NULL,
	`expected_description` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_test_cases`(`id`, `title`, `turns`, `context_content`, `expected_description`, `display_order`, `created_at`, `updated_at`)
SELECT `id`, `title`, `turns`, `context_content`, `expected_description`, `display_order`, `created_at`, `updated_at`
FROM `test_cases`;
--> statement-breakpoint
-- 既存の test_cases.project_id 関係を test_case_projects 中間テーブルに移行（重複除去）
INSERT OR IGNORE INTO `test_case_projects`(`test_case_id`, `project_id`, `created_at`)
SELECT `id`, `project_id`, `created_at`
FROM `test_cases`
WHERE `project_id` IS NOT NULL;
--> statement-breakpoint
DROP TABLE `test_cases`;
--> statement-breakpoint
ALTER TABLE `__new_test_cases` RENAME TO `test_cases`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
