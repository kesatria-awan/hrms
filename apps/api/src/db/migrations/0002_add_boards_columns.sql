-- Migration: Add boards, board_members, and columns tables
-- Phase 2: Boards & Columns

CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`color` text DEFAULT '#3B82F6' NOT NULL,
	`visibility` text DEFAULT 'workspace' NOT NULL,
	`auto_archive_done_days` integer DEFAULT 0 NOT NULL,
	`created_by_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `board_members` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `board_members_board_user_idx` ON `board_members` (`board_id`,`user_id`);

CREATE TABLE `columns` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_done_column` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `boards_workspace_idx` ON `boards` (`workspace_id`);
CREATE INDEX `columns_board_idx` ON `columns` (`board_id`);
