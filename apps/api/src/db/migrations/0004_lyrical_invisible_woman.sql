PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
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
	FOREIGN KEY (`column_id`) REFERENCES `columns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "workspace_id", "board_id", "column_id", "title", "description", "priority", "due_date", "position", "created_by_id", "completed_at", "archived_at", "created_at", "updated_at", "deleted_at") SELECT "id", "workspace_id", "board_id", "column_id", "title", "description", "priority", "due_date", "position", "created_by_id", "completed_at", "archived_at", "created_at", "updated_at", "deleted_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `tasks_workspace_idx` ON `tasks` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `tasks_board_idx` ON `tasks` (`board_id`);--> statement-breakpoint
CREATE INDEX `tasks_column_idx` ON `tasks` (`column_id`);