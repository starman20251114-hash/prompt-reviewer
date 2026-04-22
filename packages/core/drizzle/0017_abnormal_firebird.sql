PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__prompt_family_backfill` AS
SELECT
  `project_id`,
  (
    SELECT COALESCE(MAX(`id`), 0) FROM `prompt_families`
  ) + ROW_NUMBER() OVER (ORDER BY `project_id`) AS `prompt_family_id`
FROM (
  SELECT DISTINCT `project_id`
  FROM `prompt_versions`
  WHERE `prompt_family_id` IS NULL
);
--> statement-breakpoint
INSERT INTO `prompt_families` (`id`, `name`, `description`, `created_at`, `updated_at`)
SELECT `prompt_family_id`, NULL, NULL, CAST(unixepoch('subsec') * 1000 AS integer), CAST(unixepoch('subsec') * 1000 AS integer)
FROM `__prompt_family_backfill`;
--> statement-breakpoint
UPDATE `prompt_versions`
SET `prompt_family_id` = (
  SELECT `prompt_family_id`
  FROM `__prompt_family_backfill`
  WHERE `__prompt_family_backfill`.`project_id` = `prompt_versions`.`project_id`
)
WHERE `prompt_family_id` IS NULL;
--> statement-breakpoint
CREATE TABLE `__new_prompt_versions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `prompt_family_id` integer NOT NULL,
  `project_id` integer,
  `version` integer NOT NULL,
  `name` text,
  `memo` text,
  `content` text NOT NULL,
  `workflow_definition` text,
  `parent_version_id` integer,
  `created_at` integer NOT NULL,
  `is_selected` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`prompt_family_id`) REFERENCES `prompt_families`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`parent_version_id`) REFERENCES `__new_prompt_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_prompt_versions`(
  `id`,
  `prompt_family_id`,
  `project_id`,
  `version`,
  `name`,
  `memo`,
  `content`,
  `workflow_definition`,
  `parent_version_id`,
  `created_at`,
  `is_selected`
)
SELECT
  `id`,
  `prompt_family_id`,
  `project_id`,
  `version`,
  `name`,
  `memo`,
  `content`,
  `workflow_definition`,
  `parent_version_id`,
  `created_at`,
  `is_selected`
FROM `prompt_versions`;
--> statement-breakpoint
DROP TABLE `prompt_versions`;
--> statement-breakpoint
ALTER TABLE `__new_prompt_versions` RENAME TO `prompt_versions`;
--> statement-breakpoint
DROP TABLE `__prompt_family_backfill`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
