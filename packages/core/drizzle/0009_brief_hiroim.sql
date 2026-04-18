CREATE TABLE `prompt_families` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `execution_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`model` text DEFAULT 'claude-opus-4-5' NOT NULL,
	`temperature` real DEFAULT 0.7 NOT NULL,
	`api_provider` text DEFAULT 'anthropic' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `context_assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`content` text NOT NULL,
	`mime_type` text NOT NULL,
	`content_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prompt_family_context_assets` (
	`prompt_family_id` integer NOT NULL,
	`context_asset_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`prompt_family_id`, `context_asset_id`),
	FOREIGN KEY (`prompt_family_id`) REFERENCES `prompt_families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`context_asset_id`) REFERENCES `context_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `prompt_version_projects` (
	`prompt_version_id` integer NOT NULL,
	`project_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`prompt_version_id`, `project_id`),
	FOREIGN KEY (`prompt_version_id`) REFERENCES `prompt_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `test_case_context_assets` (
	`test_case_id` integer NOT NULL,
	`context_asset_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`test_case_id`, `context_asset_id`),
	FOREIGN KEY (`test_case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`context_asset_id`) REFERENCES `context_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `test_case_projects` (
	`test_case_id` integer NOT NULL,
	`project_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`test_case_id`, `project_id`),
	FOREIGN KEY (`test_case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`execution_profile_id` integer,
	`project_id` integer NOT NULL,
	`prompt_version_id` integer NOT NULL,
	`test_case_id` integer NOT NULL,
	`conversation` text NOT NULL,
	`execution_trace` text,
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
INSERT INTO `__new_runs`("id", "execution_profile_id", "project_id", "prompt_version_id", "test_case_id", "conversation", "execution_trace", "is_best", "is_discarded", "created_at", "model", "temperature", "api_provider") SELECT "id", NULL, "project_id", "prompt_version_id", "test_case_id", "conversation", "execution_trace", "is_best", "is_discarded", "created_at", "model", "temperature", "api_provider" FROM `runs`;--> statement-breakpoint
DROP TABLE `runs`;--> statement-breakpoint
ALTER TABLE `__new_runs` RENAME TO `runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`human_score` integer,
	`human_comment` text,
	`judge_score` integer,
	`judge_reason` text,
	`is_discarded` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_scores`("id", "run_id", "human_score", "human_comment", "judge_score", "judge_reason", "is_discarded", "created_at", "updated_at") SELECT "id", "run_id", "human_score", "human_comment", "judge_score", "judge_reason", "is_discarded", "created_at", "updated_at" FROM `scores`;--> statement-breakpoint
DROP TABLE `scores`;--> statement-breakpoint
ALTER TABLE `__new_scores` RENAME TO `scores`;--> statement-breakpoint
ALTER TABLE `prompt_versions` ADD `prompt_family_id` integer REFERENCES prompt_families(id);
