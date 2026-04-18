CREATE TABLE `context_asset_projects` (
	`context_asset_id` integer NOT NULL,
	`project_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`context_asset_id`, `project_id`),
	FOREIGN KEY (`context_asset_id`) REFERENCES `context_assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
