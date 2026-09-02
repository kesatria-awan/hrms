CREATE TABLE `notification_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_notifications` integer DEFAULT true NOT NULL,
	`collaboration_notifications` integer DEFAULT true NOT NULL,
	`admin_notifications` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_preferences_user_id_unique` ON `notification_preferences` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `email_suppressed` integer DEFAULT false NOT NULL;
