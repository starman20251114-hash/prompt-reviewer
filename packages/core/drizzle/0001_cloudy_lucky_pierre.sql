ALTER TABLE `test_cases` ADD `title` text NOT NULL;--> statement-breakpoint
ALTER TABLE `test_cases` ADD `context_content` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `test_cases` ADD `display_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `test_cases` ADD `updated_at` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `test_cases` DROP COLUMN `context_refs`;