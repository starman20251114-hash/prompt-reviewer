-- #209: 0011・0012 の UNIQUE インデックスを補修する
-- drizzle-kit migrate（libsql）は区切り1つにつき最初の1文しか実行しないため、
-- 0011・0012 の CREATE UNIQUE INDEX は作成されないまま適用済みとして記録されていた。
-- 適用済みファイルは書き換えず、ここでデータを失わずにインデックスを作成する。
-- 全ての文は1つのトランザクションで実行され、失敗した場合は全体がロールバックされる。
--
-- 実行プロファイル: runs.execution_profile_id から参照されるため削除しない。
-- id 最小の行は名前を維持し、それ以外は「名前 (重複 #id)」に改名する。
UPDATE `execution_profiles`
SET `name` = `name` || ' (重複 #' || `id` || ')'
WHERE `id` NOT IN (SELECT MIN(`id`) FROM `execution_profiles` GROUP BY `name`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `execution_profiles_name_unique` ON `execution_profiles` (`name`);
--> statement-breakpoint
-- プロジェクト設定: 実行時は project_id で検索した先頭（id 最小）の行が使われるため、その行を残す。
-- それ以外の行は退避テーブルに移してから削除する（必要なら手動で戻せる）。
CREATE TABLE IF NOT EXISTS `__project_settings_duplicates_0020` AS SELECT * FROM `project_settings` WHERE 0;
--> statement-breakpoint
INSERT INTO `__project_settings_duplicates_0020`
SELECT * FROM `project_settings`
WHERE `id` NOT IN (SELECT MIN(`id`) FROM `project_settings` GROUP BY `project_id`);
--> statement-breakpoint
DELETE FROM `project_settings`
WHERE `id` NOT IN (SELECT MIN(`id`) FROM `project_settings` GROUP BY `project_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `project_settings_project_id_unique` ON `project_settings` (`project_id`);
