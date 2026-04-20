CREATE TABLE `annotation_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`annotation_task_id` integer NOT NULL,
	`target_text_ref` text NOT NULL,
	`source_type` text NOT NULL,
	`source_step_id` text,
	`label` text NOT NULL,
	`start_line` integer NOT NULL,
	`end_line` integer NOT NULL,
	`quote` text NOT NULL,
	`rationale` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`annotation_task_id`) REFERENCES `annotation_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `annotation_labels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`annotation_task_id` integer NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`annotation_task_id`) REFERENCES `annotation_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `annotation_labels_task_key_unique` ON `annotation_labels` (`annotation_task_id`,`key`);--> statement-breakpoint
CREATE TABLE `annotation_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`output_mode` text DEFAULT 'span_label' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gold_annotations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`annotation_task_id` integer NOT NULL,
	`target_text_ref` text NOT NULL,
	`label` text NOT NULL,
	`start_line` integer NOT NULL,
	`end_line` integer NOT NULL,
	`quote` text NOT NULL,
	`note` text,
	`source_candidate_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`annotation_task_id`) REFERENCES `annotation_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_candidate_id`) REFERENCES `annotation_candidates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
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
INSERT INTO `__new_test_cases`("id", "title", "turns", "context_content", "expected_description", "display_order", "created_at", "updated_at") SELECT "id", "title", "turns", "context_content", "expected_description", "display_order", "created_at", "updated_at" FROM `test_cases`;--> statement-breakpoint
DROP TABLE `test_cases`;--> statement-breakpoint
ALTER TABLE `__new_test_cases` RENAME TO `test_cases`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
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
	`is_selected` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`prompt_family_id`) REFERENCES `prompt_families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_version_id`) REFERENCES `prompt_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_prompt_versions`("id", "prompt_family_id", "project_id", "version", "name", "memo", "content", "workflow_definition", "parent_version_id", "created_at", "is_selected") SELECT "id", "prompt_family_id", "project_id", "version", "name", "memo", "content", "workflow_definition", "parent_version_id", "created_at", "is_selected" FROM `prompt_versions`;--> statement-breakpoint
DROP TABLE `prompt_versions`;--> statement-breakpoint
ALTER TABLE `__new_prompt_versions` RENAME TO `prompt_versions`;--> statement-breakpoint
ALTER TABLE `runs` ADD `structured_output` text;