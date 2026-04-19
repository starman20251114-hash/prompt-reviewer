DELETE FROM `project_settings`
WHERE `id` NOT IN (
  SELECT MAX(`id`)
  FROM `project_settings`
  GROUP BY `project_id`
);

CREATE UNIQUE INDEX `project_settings_project_id_unique` ON `project_settings` (`project_id`);
