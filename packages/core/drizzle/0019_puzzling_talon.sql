PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`execution_profile_id` integer,
	`project_id` integer,
	`run_mode` text DEFAULT 'evaluation' NOT NULL,
	`prompt_version_id` integer NOT NULL,
	`test_case_id` integer,
	`ad_hoc_input` text,
	`prompt_snapshot` text NOT NULL,
	`conversation` text NOT NULL,
	`execution_trace` text,
	`structured_output` text,
	`is_best` integer DEFAULT false NOT NULL,
	`is_discarded` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`model` text NOT NULL,
	`temperature` real NOT NULL,
	`api_provider` text NOT NULL,
	FOREIGN KEY (`execution_profile_id`) REFERENCES `execution_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prompt_version_id`) REFERENCES `prompt_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`test_case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_runs`(
	"id",
	"execution_profile_id",
	"project_id",
	"run_mode",
	"prompt_version_id",
	"test_case_id",
	"ad_hoc_input",
	"prompt_snapshot",
	"conversation",
	"execution_trace",
	"structured_output",
	"is_best",
	"is_discarded",
	"created_at",
	"model",
	"temperature",
	"api_provider"
)
SELECT
	`runs`.`id`,
	`runs`.`execution_profile_id`,
	`runs`.`project_id`,
	'evaluation',
	`runs`.`prompt_version_id`,
	`runs`.`test_case_id`,
	NULL,
	COALESCE(
		(
			SELECT `prompt_versions`.`content`
			FROM `prompt_versions`
			WHERE `prompt_versions`.`id` = `runs`.`prompt_version_id`
		),
		''
	),
	`runs`.`conversation`,
	`runs`.`execution_trace`,
	`runs`.`structured_output`,
	`runs`.`is_best`,
	`runs`.`is_discarded`,
	`runs`.`created_at`,
	`runs`.`model`,
	`runs`.`temperature`,
	`runs`.`api_provider`
FROM `runs`;--> statement-breakpoint
DROP TABLE `runs`;--> statement-breakpoint
ALTER TABLE `__new_runs` RENAME TO `runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
