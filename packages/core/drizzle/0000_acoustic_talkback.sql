CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `test_cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`turns` text NOT NULL,
	`context_refs` text DEFAULT '[]' NOT NULL,
	`expected_description` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `prompt_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`version` integer NOT NULL,
	`name` text,
	`memo` text,
	`content` text NOT NULL,
	`parent_version_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_version_id`) REFERENCES `prompt_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prompt_version_id` integer NOT NULL,
	`test_case_id` integer NOT NULL,
	`conversation` text NOT NULL,
	`is_best` integer DEFAULT 0 NOT NULL,
	`human_score` integer,
	`human_comment` text,
	`is_discarded` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`prompt_version_id`) REFERENCES `prompt_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`test_case_id`) REFERENCES `test_cases`(`id`) ON UPDATE no action ON DELETE no action
);
