CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`board_id` text NOT NULL,
	`column_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`due_date` integer,
	`position` integer NOT NULL,
	`created_by_id` text NOT NULL,
	`completed_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`column_id`) REFERENCES `columns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_workspace_idx` ON `tasks` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `tasks_board_idx` ON `tasks` (`board_id`);--> statement-breakpoint
CREATE INDEX `tasks_column_idx` ON `tasks` (`column_id`);--> statement-breakpoint
CREATE TABLE `task_assignees` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`assigned_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_assignee_unique_idx` ON `task_assignees` (`task_id`,`user_id`);