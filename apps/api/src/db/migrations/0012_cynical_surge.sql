PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_boards` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`color` text DEFAULT '#3B82F6' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`auto_archive_done_days` integer DEFAULT 0 NOT NULL,
	`created_by_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_boards`("id", "workspace_id", "name", "description", "color", "visibility", "auto_archive_done_days", "created_by_id", "position", "created_at", "updated_at", "deleted_at") SELECT "id", "workspace_id", "name", "description", "color", "visibility", "auto_archive_done_days", "created_by_id", "position", "created_at", "updated_at", "deleted_at" FROM `boards`;--> statement-breakpoint
DROP TABLE `boards`;--> statement-breakpoint
ALTER TABLE `__new_boards` RENAME TO `boards`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `boards_workspace_idx` ON `boards` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `__new_board_members` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_board_members`("id", "board_id", "user_id", "role", "created_at") SELECT "id", "board_id", "user_id", "role", "created_at" FROM `board_members`;--> statement-breakpoint
DROP TABLE `board_members`;--> statement-breakpoint
ALTER TABLE `__new_board_members` RENAME TO `board_members`;--> statement-breakpoint
CREATE UNIQUE INDEX `board_members_board_user_idx` ON `board_members` (`board_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `workspaces` ADD `billing_type` text DEFAULT 'subscription' NOT NULL;