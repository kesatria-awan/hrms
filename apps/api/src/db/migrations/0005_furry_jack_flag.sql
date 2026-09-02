CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`board_id` text,
	`task_id` text,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activities_workspace_idx` ON `activities` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `activities_board_idx` ON `activities` (`board_id`);--> statement-breakpoint
CREATE INDEX `activities_task_idx` ON `activities` (`task_id`);--> statement-breakpoint
CREATE INDEX `activities_user_idx` ON `activities` (`user_id`);--> statement-breakpoint
CREATE INDEX `activities_created_at_idx` ON `activities` (`created_at`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comments_task_idx` ON `comments` (`task_id`);--> statement-breakpoint
CREATE INDEX `comments_workspace_idx` ON `comments` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `comments_user_idx` ON `comments` (`user_id`);--> statement-breakpoint
CREATE TABLE `mentions` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mention_unique_idx` ON `mentions` (`comment_id`,`user_id`);