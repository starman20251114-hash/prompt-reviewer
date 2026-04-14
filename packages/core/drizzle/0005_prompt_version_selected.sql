-- prompt_versions テーブルに is_selected カラムを追加
-- プロジェクト内で「Selected（選定版）」として1バージョンをマークできる
ALTER TABLE `prompt_versions` ADD `is_selected` integer NOT NULL DEFAULT 0;
