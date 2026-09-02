CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`task_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`r2_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`uploaded_by_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attachments_task_idx` ON `attachments` (`task_id`);--> statement-breakpoint
CREATE INDEX `attachments_workspace_idx` ON `attachments` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `attachments_status_idx` ON `attachments` (`status`);--> statement-breakpoint
CREATE INDEX `attachments_uploaded_by_idx` ON `attachments` (`uploaded_by_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_r2_key_idx` ON `attachments` (`r2_key`);