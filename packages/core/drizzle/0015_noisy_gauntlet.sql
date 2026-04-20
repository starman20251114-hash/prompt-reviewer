CREATE TABLE `annotation_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`output_mode` text DEFAULT 'span_label' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "annotation_tasks_output_mode_check" CHECK("annotation_tasks"."output_mode" in ('span_label'))
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
CREATE UNIQUE INDEX `annotation_labels_task_key_unique` ON `annotation_labels` (`annotation_task_id`,`key`);
--> statement-breakpoint
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
	FOREIGN KEY (`annotation_task_id`) REFERENCES `annotation_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "annotation_candidates_source_type_check" CHECK("annotation_candidates"."source_type" in ('final_answer', 'structured_json', 'trace_step')),
	CONSTRAINT "annotation_candidates_status_check" CHECK("annotation_candidates"."status" in ('pending', 'accepted', 'rejected'))
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
