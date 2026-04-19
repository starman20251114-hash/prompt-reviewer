DELETE FROM `execution_profiles`
WHERE `id` NOT IN (
  SELECT MAX(`id`)
  FROM `execution_profiles`
  GROUP BY `name`
);

CREATE UNIQUE INDEX `execution_profiles_name_unique` ON `execution_profiles` (`name`);
