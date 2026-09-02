CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `announcements_workspace_idx` ON `announcements` (`workspace_id`);