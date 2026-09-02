-- Create workspaces table
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`owner_id` text NOT NULL,
	`clerk_org_id` text,
	`storage_used_bytes` integer DEFAULT 0 NOT NULL,
	`storage_quota_bytes` integer DEFAULT 10737418240 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_clerk_org_id_unique` ON `workspaces` (`clerk_org_id`);
--> statement-breakpoint
-- SQLite doesn't support ALTER TABLE DROP COLUMN well, so we recreate the users table
-- Create new users table with updated schema
CREATE TABLE `users_new` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`image_url` text,
	`workspace_id` text REFERENCES `workspaces`(`id`),
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
-- Copy existing data (only id and email, other columns are new or removed)
INSERT INTO `users_new` (`id`, `email`, `created_at`, `updated_at`)
SELECT `id`, `email`, `created_at`, `updated_at` FROM `users`;
--> statement-breakpoint
-- Drop old table and indexes
DROP INDEX IF EXISTS `users_username_unique`;
--> statement-breakpoint
DROP INDEX IF EXISTS `users_email_unique`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
-- Rename new table
ALTER TABLE `users_new` RENAME TO `users`;
--> statement-breakpoint
-- Recreate email unique index
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
